import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";
import { upload, uploadImageToStorage } from "../upload.js";

const router = Router();

// Settings > Upload Your Songs — every route here requires login (unlike
// Contact Us, a submission needs a real userId to review against and to
// show the submitter their own status).
router.use(requireAuth);

const audioUploadUrlSchema = z.object({
  // yt-dlp-style extension passthrough — the client always records audio as
  // .mp3 today, but this keeps the door open without a code change if that
  // ever changes.
  fileExt: z.string().trim().max(10).optional(),
});

// POST /api/submissions/upload-audio-url — mints a one-time signed upload
// URL for one song's audio, same "browser uploads straight to Supabase,
// never through this server's memory" pattern as admin.ts's
// /upload-track. Called once per track before the final POST /api/submissions
// (which only ever receives URLs, never raw file bytes).
router.post("/upload-audio-url", async (req: AuthedRequest, res) => {
  const parsed = audioUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const ext = parsed.data.fileExt ? (parsed.data.fileExt.startsWith(".") ? parsed.data.fileExt : `.${parsed.data.fileExt}`) : ".mp3";
  const path = `${randomUUID()}${ext}`;

  const { data: signed, error: signError } = await supabaseAdmin.storage.from("audio-tracks").createSignedUploadUrl(path);
  if (signError || !signed) {
    res.status(500).json({ error: signError?.message ?? "Could not create upload URL" });
    return;
  }
  const { data: publicUrlData } = supabaseAdmin.storage.from("audio-tracks").getPublicUrl(path);
  res.json({ signedUrl: signed.signedUrl, publicUrl: publicUrlData.publicUrl });
});

// POST /api/submissions/upload-image — artist photo, album art, or single
// artwork; small enough to buffer in memory for one request, same as every
// other image upload in the app (see upload.ts).
router.post("/upload-image", upload.single("image"), async (req: AuthedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded" });
    return;
  }
  try {
    const url = await uploadImageToStorage(req.file.buffer, req.file.mimetype);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Image upload failed" });
  }
});

const trackSchema = z.object({
  title: z.string().trim().min(1).max(200),
  audioUrl: z.string().url(),
  // Single-only — see SongSubmissionTrack.artworkUrl in schema.prisma.
  artworkUrl: z.string().url().optional(),
});

const submitSchema = z
  .object({
    type: z.enum(["single", "album"]),
    artistName: z.string().trim().min(1).max(120),
    artistPhotoUrl: z.string().url().optional(),
    albumTitle: z.string().trim().min(1).max(200).optional(),
    albumCoverUrl: z.string().url().optional(),
    confirmRights: z.literal(true, "You must confirm you have the rights to upload this music"),
    tracks: z.array(trackSchema).min(1).max(50),
  })
  .refine((v) => v.type !== "single" || (v.tracks.length === 1 && Boolean(v.tracks[0].artworkUrl)), {
    message: "A single needs exactly one song, with artwork",
  })
  .refine((v) => v.type !== "album" || (Boolean(v.albumTitle) && Boolean(v.albumCoverUrl)), {
    message: "An album needs a title and album art",
  });

// POST /api/submissions — creates the pending submission itself, once every
// file it references has already been uploaded (audio via the signed-URL
// dance above, images via /upload-image). Never touches the real catalog —
// see admin.ts's /submissions/:id/approve for the only path that does.
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { type, artistName, artistPhotoUrl, albumTitle, albumCoverUrl, tracks } = parsed.data;

  const submission = await prisma.songSubmission.create({
    data: {
      userId: req.userId!,
      type,
      artistName,
      artistPhotoUrl: type === "album" ? artistPhotoUrl : undefined,
      albumTitle: type === "album" ? albumTitle : undefined,
      albumCoverUrl: type === "album" ? albumCoverUrl : undefined,
      tracks: {
        create: tracks.map((t, i) => ({
          title: t.title,
          position: i,
          audioUrl: t.audioUrl,
          artworkUrl: type === "single" ? t.artworkUrl : undefined,
        })),
      },
    },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  res.status(201).json({ submission });
});

// GET /api/submissions/mine — lets a user see what happened to what they
// submitted (pending/approved/rejected), same reasoning AdminContactMessages
// mirrors the public Contact Us form.
router.get("/mine", async (req: AuthedRequest, res) => {
  const submissions = await prisma.songSubmission.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  res.json({ submissions });
});

export default router;
