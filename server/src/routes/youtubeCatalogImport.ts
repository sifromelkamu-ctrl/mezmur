import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import {
  enumerateYoutubeCatalog,
  enumerateYoutubePlaylist,
  enumerateYoutubeVideoUrls,
} from "../youtube/catalogEnumerate.js";
import { resumeBatch, startBatchImport } from "../youtube/catalogWorker.js";
import { extractYoutubePlaylistId, normalizeYoutubeChannelUrl } from "../youtube/validate.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { gradientForSeed } from "./admin.js";

const router = Router();

// This router is mounted under the already-isAdmin-gated /api/admin/youtube-import
// router (see routes/youtubeImport.ts), so every route here is admin-only too.

const startEnumerationSchema = z
  .object({
    url: z.string().trim().min(1).optional(),
    urls: z.array(z.string().trim().min(1)).optional(),
    confirmRights: z.literal(true, "You must confirm you have permission to use this content"),
    artistMode: z.enum(["existing", "new"]),
    artistId: z.string().min(1).optional(),
    artistName: z.string().trim().min(1).max(120).optional(),
    // "Allow duplicate imports" — off by default (skip anything that
    // already exists, today's behavior). When true, every album/single/
    // track in this batch imports as a brand-new row, never matched or
    // skipped against existing content.
    allowDuplicates: z.boolean().optional().default(false),
  })
  .refine((v) => (v.artistMode === "existing" ? Boolean(v.artistId) : Boolean(v.artistName)), {
    message: "Choose an existing artist, or provide a name for the new artist",
  });

// Resolves the batch's target artist up front — required, never guessed.
// "existing" must reference a real catalog artist; "new" hard-blocks on a
// normalized-name match against any existing catalog artist (case-
// insensitive, punctuation/diacritic-insensitive) rather than silently
// creating a likely duplicate — the admin must either pick the existing
// artist or choose a genuinely different name. Returns null (after writing
// the response itself) on any validation failure, so callers just return.
async function resolveTargetArtist(
  res: import("express").Response,
  input: { artistMode: "existing" | "new"; artistId?: string; artistName?: string }
): Promise<{ id: string; name: string } | null> {
  if (input.artistMode === "existing") {
    const artist = await prisma.artist.findFirst({ where: { id: input.artistId, ownerId: null } });
    if (!artist) {
      res.status(404).json({ error: "Selected artist not found" });
      return null;
    }
    return artist;
  }

  const name = input.artistName!.trim();
  const normalized = normalizeForMatch(name);
  const catalogArtists = await prisma.artist.findMany({ where: { ownerId: null }, select: { id: true, name: true } });
  const duplicate = catalogArtists.find((a) => normalizeForMatch(a.name) === normalized);
  if (duplicate) {
    res.status(409).json({
      error: `An artist named "${duplicate.name}" already exists — choose it from Existing Artist, or use a different name.`,
      suggestedArtist: duplicate,
    });
    return null;
  }

  const [gradientFrom, gradientTo] = gradientForSeed(name);
  // No photo — catalog import never fetches/assigns artwork; the manual
  // Artwork Editor is the only way to set one afterward.
  return prisma.artist.create({ data: { name, gradientFrom, gradientTo } });
}

// POST /api/admin/youtube-import/catalog — validates the input, rights
// confirmation, and target artist, creates a batch, and enumerates in the
// background. Accepts three input shapes: a channel/artist URL, a direct
// playlist URL, or a list of individual video URLs (bulk import from
// channels, playlists, or multiple URLs) — whichever is present in the
// request determines the mode.
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = startEnumerationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { url, urls, artistMode, artistId, artistName, allowDuplicates } = parsed.data;

  const targetArtist = await resolveTargetArtist(res, { artistMode, artistId, artistName });
  if (!targetArtist) return; // response already sent (404 or 409)

  let sourceUrl: string;
  let run: () => Promise<Awaited<ReturnType<typeof enumerateYoutubeCatalog>>>;

  if (urls && urls.length > 0) {
    sourceUrl = `${urls.length} URLs`;
    run = () => enumerateYoutubeVideoUrls(urls);
  } else if (url) {
    const playlistId = extractYoutubePlaylistId(url);
    const channelUrl = normalizeYoutubeChannelUrl(url);
    if (playlistId) {
      sourceUrl = url;
      run = () => enumerateYoutubePlaylist(playlistId);
    } else if (channelUrl) {
      sourceUrl = channelUrl;
      run = () => enumerateYoutubeCatalog(channelUrl);
    } else {
      res.status(400).json({ error: "That doesn't look like a YouTube channel, playlist, or video URL" });
      return;
    }
  } else {
    res.status(400).json({ error: "Provide a channel/playlist URL or a list of video URLs" });
    return;
  }

  const existingAlbums = await prisma.album.findMany({
    where: { artistId: targetArtist.id },
    select: { title: true },
  });
  const existingAlbumTitlesSnapshot = existingAlbums.map((a) => normalizeForMatch(a.title));

  const batch = await prisma.youtubeImportBatch.create({
    data: {
      sourceUrl,
      status: "enumerating",
      createdBy: req.userId!,
      targetArtistId: targetArtist.id,
      existingAlbumTitlesSnapshot,
      allowDuplicates,
    },
  });

  run()
    .then(async (result) => {
      await prisma.$transaction([
        prisma.youtubeImportItem.createMany({
          data: result.items.map((item) => ({
            batchId: batch.id,
            videoId: item.videoId,
            title: item.title,
            albumTitle: item.albumTitle,
            position: item.position,
            thumbnailUrl: item.thumbnailUrl,
            duration: item.duration ?? undefined,
            status: item.isDuplicate && !allowDuplicates ? "skipped_duplicate" : "pending",
          })),
        }),
        prisma.youtubeImportBatch.update({
          where: { id: batch.id },
          data: {
            status: "ready",
            channelName: result.channelName,
            error: result.truncated ? "Only the first items were imported; this source has more than the supported limit." : null,
          },
        }),
      ]);
    })
    .catch(async (err) => {
      await prisma.youtubeImportBatch.update({
        where: { id: batch.id },
        data: { status: "error", error: err instanceof Error ? err.message : "Enumeration failed" },
      });
    });

  res.status(202).json({ batchId: batch.id });
});

const addUrlsSchema = z.object({ urls: z.array(z.string().trim().min(1)).min(1) });

// POST /api/admin/youtube-import/catalog/:batchId/add-urls — appends more
// individual videos to an already-enumerated (or even already-ready) batch,
// as standalone ungrouped items. Lets an admin top up a channel/playlist
// import with a few extra one-off URLs without starting a new batch.
router.post("/:batchId/add-urls", async (req, res) => {
  const parsed = addUrlsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }

  const existingCount = await prisma.youtubeImportItem.count({ where: { batchId: batch.id } });
  try {
    const result = await enumerateYoutubeVideoUrls(parsed.data.urls);
    const existingVideoIds = new Set(
      (await prisma.youtubeImportItem.findMany({ where: { batchId: batch.id }, select: { videoId: true } })).map((i) => i.videoId)
    );
    const newItems = result.items.filter((i) => !existingVideoIds.has(i.videoId));
    await prisma.youtubeImportItem.createMany({
      data: newItems.map((item, i) => ({
        batchId: batch.id,
        videoId: item.videoId,
        title: item.title,
        albumTitle: null,
        position: existingCount + i,
        thumbnailUrl: item.thumbnailUrl,
        duration: item.duration ?? undefined,
        status: item.isDuplicate && !batch.allowDuplicates ? "skipped_duplicate" : "pending",
      })),
    });
    res.status(201).json({ added: newItems.length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not read those URLs" });
  }
});

// GET /api/admin/youtube-import/catalog — lists this admin's batches
// (lightweight, no items) so the UI can offer to resume/reopen a previous
// run after a page reload or server restart. Supports optional ?q= (search
// by channel name/source URL), ?status=, and pagination (?page=, ?pageSize=)
// for the Import History screen.
router.get("/", async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

  const where = {
    createdBy: req.userId!,
    ...(status ? { status: status as never } : {}),
    ...(q ? { OR: [{ channelName: { contains: q, mode: "insensitive" as const } }, { sourceUrl: { contains: q, mode: "insensitive" as const } }] } : {}),
  };

  const [batches, total] = await Promise.all([
    prisma.youtubeImportBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.youtubeImportBatch.count({ where }),
  ]);
  res.json({
    total,
    page,
    pageSize,
    batches: batches.map((b) => ({
      id: b.id,
      sourceUrl: b.sourceUrl,
      channelName: b.channelName,
      label: b.label,
      status: b.status,
      error: b.error,
      itemCount: b._count.items,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
  });
});

const renameSchema = z.object({ label: z.string().trim().max(120).nullable() });

// PATCH /api/admin/youtube-import/catalog/:batchId/label — renames a history
// entry for display purposes only. Purely cosmetic: it never touches
// sourceUrl, channelName, status, or anything the pipeline itself reads.
router.patch("/:batchId/label", async (req: AuthedRequest, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch || batch.createdBy !== req.userId) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const updated = await prisma.youtubeImportBatch.update({
    where: { id: batch.id },
    data: { label: parsed.data.label },
  });
  res.json({ id: updated.id, label: updated.label });
});

// GET /api/admin/youtube-import/catalog/:batchId — full batch detail with
// every item, used for the review/selection screen and for progress polling
// during/after import. Each item gets a computed `kind` ("album" | "single")
// purely for display — the underlying signal (albumTitle null or not) has
// always driven the actual import behavior, this just names it explicitly.
router.get("/:batchId", async (req, res) => {
  const batch = await prisma.youtubeImportBatch.findUnique({
    where: { id: String(req.params.batchId) },
    include: { items: { orderBy: [{ albumTitle: "asc" }, { position: "asc" }] } },
  });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  res.json({
    ...batch,
    items: batch.items.map((item) => ({ ...item, kind: item.albumTitle ? "album" : "single" })),
  });
});

const selectSchema = z.object({
  selected: z.boolean(),
  all: z.boolean().optional(),
  albumTitle: z.string().nullable().optional(),
  // Bulk "Import Albums Only" / "Import Singles Only" filter: true matches
  // every item with an album, false matches every standalone single.
  hasAlbum: z.boolean().optional(),
  itemIds: z.array(z.string()).optional(),
});

// POST /api/admin/youtube-import/catalog/:batchId/select — toggles which
// items are chosen for import. Supports selecting everything (all: true),
// everything within one album (albumTitle), every album or every single
// (hasAlbum), or an explicit list of item ids. Duplicates and items already
// done/in-flight are left untouched regardless.
router.post("/:batchId/select", async (req, res) => {
  const parsed = selectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batchId = String(req.params.batchId);
  const { selected, all, albumTitle, hasAlbum, itemIds } = parsed.data;

  const where = {
    batchId,
    status: { in: ["pending", "error"] as ("pending" | "error")[] },
    ...(all
      ? {}
      : albumTitle !== undefined
        ? { albumTitle }
        : hasAlbum !== undefined
          ? { albumTitle: hasAlbum ? { not: null } : null }
          : itemIds
            ? { id: { in: itemIds } }
            : { id: "__none__" }),
  };

  await prisma.youtubeImportItem.updateMany({ where, data: { selected } });
  res.status(204).end();
});

// POST /api/admin/youtube-import/catalog/:batchId/start — queues every
// selected item (first attempt or retry of a previously failed one) and
// starts background processing.
router.post("/:batchId/start", async (req, res) => {
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const count = await startBatchImport(batch.id);
  if (count === 0) {
    res.status(400).json({ error: "No songs selected to import" });
    return;
  }
  res.status(202).json({ queued: count });
});

// POST /api/admin/youtube-import/catalog/:batchId/resume — manually re-queues
// any item left stuck mid-pipeline (e.g. the server restarted while this
// batch was importing and, for whatever reason, the automatic boot-time
// resume didn't pick it up).
router.post("/:batchId/resume", async (req, res) => {
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const count = await resumeBatch(batch.id);
  res.status(202).json({ resumed: count });
});

// ---- Import History management ----
// These routes only ever delete YoutubeImportBatch/YoutubeImportItem rows —
// the import log — never the Track/Album/Artist records a completed import
// created. There's no foreign key from an item back to the track it made
// (trackId is a plain string reference), so nothing about the actual catalog
// content is ever touched here.

const CLEARABLE_STATUSES = ["completed", "completed_with_errors", "error"] as const;

// POST /api/admin/youtube-import/catalog/clear-completed — removes history
// entries for successfully completed imports only.
router.post("/clear-completed", async (req: AuthedRequest, res) => {
  const { count } = await prisma.youtubeImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: "completed" },
  });
  res.json({ deleted: count });
});

// POST /api/admin/youtube-import/catalog/clear-failed — removes history
// entries for imports that ended in an error.
router.post("/clear-failed", async (req: AuthedRequest, res) => {
  const { count } = await prisma.youtubeImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: { in: ["error", "completed_with_errors"] } },
  });
  res.json({ deleted: count });
});

// POST /api/admin/youtube-import/catalog/clear-all — removes all of this
// admin's finished (non in-flight) import history.
router.post("/clear-all", async (req: AuthedRequest, res) => {
  const { count } = await prisma.youtubeImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: { in: [...CLEARABLE_STATUSES] } },
  });
  res.json({ deleted: count });
});

const deleteSelectedSchema = z.object({ batchIds: z.array(z.string()).min(1) });

// POST /api/admin/youtube-import/catalog/delete-selected — removes a
// specific set of history entries, e.g. from checkboxes in the history list.
router.post("/delete-selected", async (req: AuthedRequest, res) => {
  const parsed = deleteSelectedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { count } = await prisma.youtubeImportBatch.deleteMany({
    where: { createdBy: req.userId!, id: { in: parsed.data.batchIds } },
  });
  res.json({ deleted: count });
});

// DELETE /api/admin/youtube-import/catalog/:batchId — removes a single
// history entry (the "X" on an import history card). Only the log is
// deleted; anything the import actually created stays untouched.
router.delete("/:batchId", async (req: AuthedRequest, res) => {
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch || batch.createdBy !== req.userId) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  await prisma.youtubeImportBatch.delete({ where: { id: batch.id } });
  res.status(204).end();
});

export default router;
