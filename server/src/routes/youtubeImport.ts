import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { extractYoutubeVideoId } from "../youtube/validate.js";
import { getImportJob, startYoutubeImport } from "../youtube/importJob.js";
import { fetchYoutubeMetadata, YtDlpError } from "../youtube/ytdlp.js";
import catalogRouter from "./youtubeCatalogImport.js";

const router = Router();

// Every route in this file is admin-only, matching the rest of the catalog
// import/upload surface (see routes/admin.ts) — downloading and rehosting
// third-party video audio is a rights-sensitive action, not something any
// logged-in user should be able to trigger.
router.use(isAdmin);

// Mounted before the single-video routes below so "/catalog/..." is never
// swallowed by the "/:jobId" param route.
router.use("/catalog", catalogRouter);

const previewSchema = z.object({ url: z.string().trim().min(1) });

// POST /api/admin/youtube-import/preview — the "Edit Metadata" step's data
// source: fetches the video's title/uploader/thumbnail only (no download,
// no track created) so the admin can review and edit them before anything
// is actually imported. Also front-runs the same duplicate check the real
// import does, so a re-import attempt is caught before the admin bothers
// editing metadata for a video already in the catalog.
router.post("/preview", async (req: AuthedRequest, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const videoId = extractYoutubeVideoId(parsed.data.url);
  if (!videoId) {
    res.status(400).json({ error: "That doesn't look like a valid YouTube URL" });
    return;
  }

  const existing = await prisma.track.findUnique({ where: { sourceId: videoId } });
  if (existing) {
    res.status(409).json({ error: "This video has already been imported", trackId: existing.id });
    return;
  }

  try {
    const metadata = await fetchYoutubeMetadata(parsed.data.url);
    if (metadata.isLive) {
      res.status(400).json({ error: "Live streams can't be imported" });
      return;
    }
    if (metadata.availability && !["public", "unlisted"].includes(metadata.availability)) {
      res.status(400).json({ error: `This video is not publicly accessible (${metadata.availability})` });
      return;
    }
    res.json({
      title: metadata.title,
      artistName: metadata.uploader ?? metadata.channel ?? "",
      thumbnail: metadata.thumbnail,
      duration: metadata.duration,
    });
  } catch (err) {
    if (err instanceof YtDlpError) {
      res.status(400).json({ error: `Could not fetch video info: ${err.message}` });
      return;
    }
    console.error("[youtube-import:preview] unexpected error:", err);
    res.status(400).json({ error: "Could not fetch video info" });
  }
});

const startImportSchema = z.object({
  url: z.string().trim().min(1),
  // Explicit user attestation that they hold the rights to use this content.
  // This is the only permission gate that's actually possible to enforce in
  // code — there is no automated way to verify real-world copyright/license
  // status of a YouTube video, so we require an affirmative confirmation and
  // record it (with the video ID and requesting admin) in the audit log.
  confirmRights: z.literal(true, "You must confirm you have permission to use this content"),
  albumId: z.string().min(1).optional(),
  genre: z.string().trim().max(60).optional(),
  // True only when the "Single" destination was explicitly chosen — this is
  // what makes a track eligible for Home's Singles section (see
  // routes/singles.ts); a plain no-album import (this flag omitted) never
  // shows there, even though it's still a normal standalone track everywhere
  // else.
  isSingle: z.boolean().optional(),
  // The "Edit Metadata" step's confirmed values (Single destination only) —
  // when present, these win over whatever fetchYoutubeMetadata/the video's
  // own channel name would otherwise produce.
  titleOverride: z.string().trim().min(1).max(200).optional(),
  // Links to this exact existing artist, bypassing name matching entirely —
  // set when the admin picked a suggestion from the searchable artist list.
  artistId: z.string().min(1).optional(),
  // The admin-edited artist name — used for matching (and, if createArtist
  // is true, for creating) instead of the video's raw uploader/channel name.
  artistName: z.string().trim().max(120).optional(),
  // Explicit opt-in to create a brand-new artist with `artistName` — set
  // only when the typed name didn't match any existing artist and the admin
  // didn't pick one from the list either. Never guessed.
  createArtist: z.boolean().optional(),
});

// POST /api/admin/youtube-import — validates the URL and permission
// confirmation, rejects videos already imported, then kicks off the
// download/convert/upload pipeline in the background and returns a job id
// immediately so the client can poll for progress.
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = startImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const videoId = extractYoutubeVideoId(parsed.data.url);
  if (!videoId) {
    res.status(400).json({ error: "That doesn't look like a valid YouTube URL" });
    return;
  }

  const existing = await prisma.track.findUnique({ where: { sourceId: videoId } });
  if (existing) {
    res.status(409).json({ error: "This video has already been imported", trackId: existing.id });
    return;
  }

  const jobId = startYoutubeImport({
    url: parsed.data.url,
    adminId: req.userId!,
    albumId: parsed.data.albumId,
    genre: parsed.data.genre,
    isSingle: parsed.data.isSingle,
    titleOverride: parsed.data.titleOverride,
    targetArtistId: parsed.data.artistId,
    artistNameOverride: parsed.data.artistName,
    createArtist: parsed.data.createArtist,
  });

  res.status(202).json({ jobId });
});

// GET /api/admin/youtube-import/:jobId — poll the status of an in-flight
// import job (progress, current stage, or the finished/errored result).
router.get("/:jobId", (req, res) => {
  const job = getImportJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }
  res.json(job);
});

export default router;
