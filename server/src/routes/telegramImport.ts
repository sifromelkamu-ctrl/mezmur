import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { enumerateTelegramChannel } from "../telegram/enumerate.js";
import { cancelItem, resumeBatch, startBatchImport, stopBatch } from "../telegram/worker.js";
import { extractTelegramChannelUsername } from "../telegram/validate.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { resolveTargetArtist } from "../catalogImport/shared.js";
import { toSafeErrorMessage } from "../youtube/safeError.js";

const router = Router();

// Rights-sensitive action, same as the YouTube import surface — see
// routes/youtubeImport.ts's identical comment for why this is gated to
// admins only.
router.use(isAdmin);

const startEnumerationSchema = z
  .object({
    url: z.string().trim().min(1),
    // Explicit user attestation that they hold the rights to use this
    // content — Telegram channels are at least as likely as YouTube to
    // redistribute copyrighted music without authorization, so this gate is
    // kept identical in spirit to the YouTube import flow.
    confirmRights: z.literal(true, "You must confirm you have permission to use this content"),
    artistMode: z.enum(["existing", "new"]),
    artistId: z.string().min(1).optional(),
    artistName: z.string().trim().min(1).max(120).optional(),
    allowDuplicates: z.boolean().optional().default(false),
  })
  .refine((v) => (v.artistMode === "existing" ? Boolean(v.artistId) : Boolean(v.artistName)), {
    message: "Choose an existing artist, or provide a name for the new artist",
  });

// POST /api/admin/telegram-import — validates the input, rights
// confirmation, and target artist, creates a batch, and enumerates the
// channel's audio posts in the background.
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = startEnumerationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { url, artistMode, artistId, artistName, allowDuplicates } = parsed.data;

  if (!extractTelegramChannelUsername(url)) {
    res.status(400).json({ error: "That doesn't look like a Telegram channel link (expected t.me/channelname or @channelname)" });
    return;
  }

  const targetArtist = await resolveTargetArtist(res, { artistMode, artistId, artistName });
  if (!targetArtist) return; // response already sent (404 or 409)

  const existingAlbums = await prisma.album.findMany({
    where: { artistId: targetArtist.id },
    select: { title: true },
  });
  const existingAlbumTitlesSnapshot = existingAlbums.map((a) => normalizeForMatch(a.title));

  const batch = await prisma.telegramImportBatch.create({
    data: {
      sourceUrl: url,
      status: "enumerating",
      createdBy: req.userId!,
      targetArtistId: targetArtist.id,
      existingAlbumTitlesSnapshot,
      allowDuplicates,
    },
  });

  enumerateTelegramChannel(url)
    .then(async (result) => {
      await prisma.$transaction([
        prisma.telegramImportItem.createMany({
          data: result.items.map((item) => ({
            batchId: batch.id,
            messageId: item.messageId,
            title: item.title,
            performer: item.performer,
            position: item.position,
            duration: item.duration ?? undefined,
            status: item.isDuplicate && !allowDuplicates ? "skipped_duplicate" : "pending",
          })),
        }),
        prisma.telegramImportBatch.update({
          where: { id: batch.id },
          data: {
            status: "ready",
            channelName: result.channelName,
            error: null,
            // Drives the selection screen's "Load older songs" button
            // instead of a scary red error — reaching this page's cap isn't
            // a failure, just a normal stopping point for one request. See
            // /load-more below for how the admin continues past it.
            truncated: result.truncated,
          },
        }),
      ]);
    })
    .catch(async (err) => {
      await prisma.telegramImportBatch.update({
        where: { id: batch.id },
        data: { status: "error", error: toSafeErrorMessage(err, "Enumeration failed", "telegram-enumerate") },
      });
    });

  res.status(202).json({ batchId: batch.id });
});

// POST /api/admin/telegram-import/:batchId/load-more — continues
// enumeration past the current page, appending the next PAGE_SIZE older
// songs to this same batch. Only meaningful while batch.truncated is true
// (see the initial enumeration above); Telegram message ids are
// monotonically increasing per channel, so the numeric minimum among this
// batch's already-fetched items is exactly "the oldest song seen so far" —
// enumerateTelegramChannel continues strictly before that id.
router.post("/:batchId/load-more", async (req, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  if (!batch.truncated) {
    res.status(400).json({ error: "This channel has no older songs left to load" });
    return;
  }

  const existingItems = await prisma.telegramImportItem.findMany({
    where: { batchId: batch.id },
    select: { messageId: true, position: true },
  });
  const oldestMessageId = Math.min(...existingItems.map((i) => Number(i.messageId)));
  const nextPosition = Math.max(...existingItems.map((i) => i.position)) + 1;

  try {
    const result = await enumerateTelegramChannel(batch.sourceUrl, {
      beforeMessageId: oldestMessageId,
      startPosition: nextPosition,
    });
    const existingIds = new Set(existingItems.map((i) => i.messageId));
    const newItems = result.items.filter((item) => !existingIds.has(item.messageId));

    await prisma.$transaction([
      prisma.telegramImportItem.createMany({
        data: newItems.map((item) => ({
          batchId: batch.id,
          messageId: item.messageId,
          title: item.title,
          performer: item.performer,
          position: item.position,
          duration: item.duration ?? undefined,
          status: item.isDuplicate && !batch.allowDuplicates ? "skipped_duplicate" : "pending",
        })),
      }),
      prisma.telegramImportBatch.update({ where: { id: batch.id }, data: { truncated: result.truncated } }),
    ]);
    res.status(201).json({ added: newItems.length, truncated: result.truncated });
  } catch (err) {
    res.status(400).json({ error: toSafeErrorMessage(err, "Could not load older songs", "telegram-load-more") });
  }
});

const assignAlbumSchema = z.object({
  itemIds: z.array(z.string()).min(1),
  // null clears the assignment back to "Single".
  albumTitle: z.string().trim().min(1).max(200).nullable(),
});

// POST /api/admin/telegram-import/:batchId/assign-album — no YouTube
// equivalent. A Telegram channel has no Releases/Playlists to auto-detect
// album grouping from, so the admin explicitly assigns a (new or existing)
// album title to a checked subset of enumerated items, repeatable with a
// different name/subset to build several albums out of one channel run;
// anything never assigned stays a standalone Single. The actual
// match-or-create happens later, at import time, via the shared
// findOrCreateAlbum — this route only ever records the chosen title.
router.post("/:batchId/assign-album", async (req, res) => {
  const parsed = assignAlbumSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }

  await prisma.telegramImportItem.updateMany({
    where: { batchId: batch.id, id: { in: parsed.data.itemIds } },
    data: { albumTitle: parsed.data.albumTitle },
  });
  res.status(204).end();
});

const selectSchema = z.object({
  selected: z.boolean(),
  all: z.boolean().optional(),
  albumTitle: z.string().nullable().optional(),
  hasAlbum: z.boolean().optional(),
  itemIds: z.array(z.string()).optional(),
});

// POST /api/admin/telegram-import/:batchId/select — toggles which items are
// chosen for import. Same shape as YouTube catalog import's /select.
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

  await prisma.telegramImportItem.updateMany({ where, data: { selected } });
  res.status(204).end();
});

// GET /api/admin/telegram-import — lists this admin's batches for the Import
// History screen. Same shape as YouTube's.
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
    prisma.telegramImportBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { items: true } } },
    }),
    prisma.telegramImportBatch.count({ where }),
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

// PATCH /api/admin/telegram-import/:batchId/label — cosmetic rename, same as
// YouTube's.
router.patch("/:batchId/label", async (req: AuthedRequest, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch || batch.createdBy !== req.userId) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const updated = await prisma.telegramImportBatch.update({
    where: { id: batch.id },
    data: { label: parsed.data.label },
  });
  res.json({ id: updated.id, label: updated.label });
});

// GET /api/admin/telegram-import/:batchId — full batch detail with every
// item, used for the review/selection screen and progress polling.
router.get("/:batchId", async (req, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({
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

// POST /api/admin/telegram-import/:batchId/start — queues every selected
// item and starts background processing.
router.post("/:batchId/start", async (req, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
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

// POST /api/admin/telegram-import/:batchId/resume — manually re-queues any
// item left stuck mid-pipeline.
router.post("/:batchId/resume", async (req, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const count = await resumeBatch(batch.id);
  res.status(202).json({ resumed: count });
});

// POST /api/admin/telegram-import/:batchId/stop — admin-triggered manual
// stop.
router.post("/:batchId/stop", async (req, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  const count = await stopBatch(batch.id);
  res.status(202).json({ stopped: count });
});

// POST /api/admin/telegram-import/:batchId/items/:itemId/cancel —
// admin-triggered cancel for exactly one item.
router.post("/:batchId/items/:itemId/cancel", async (req, res) => {
  const item = await prisma.telegramImportItem.findUnique({ where: { id: String(req.params.itemId) } });
  if (!item || item.batchId !== String(req.params.batchId)) {
    res.status(404).json({ error: "Import item not found" });
    return;
  }
  const result = await cancelItem(item.id);
  if (result === "not_active") {
    res.status(400).json({ error: "This item isn't queued or in progress" });
    return;
  }
  res.status(202).json({ result });
});

// ---- Import History management ----
// Only ever deletes TelegramImportBatch/Item rows (the import log) — never
// the Track/Album/Artist records a completed import created. See
// youtubeCatalogImport.ts's identical comment.

const CLEARABLE_STATUSES = ["completed", "completed_with_errors", "error"] as const;

router.post("/clear-completed", async (req: AuthedRequest, res) => {
  const { count } = await prisma.telegramImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: "completed" },
  });
  res.json({ deleted: count });
});

router.post("/clear-failed", async (req: AuthedRequest, res) => {
  const { count } = await prisma.telegramImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: { in: ["error", "completed_with_errors"] } },
  });
  res.json({ deleted: count });
});

router.post("/clear-all", async (req: AuthedRequest, res) => {
  const { count } = await prisma.telegramImportBatch.deleteMany({
    where: { createdBy: req.userId!, status: { in: [...CLEARABLE_STATUSES] } },
  });
  res.json({ deleted: count });
});

const deleteSelectedSchema = z.object({ batchIds: z.array(z.string()).min(1) });

router.post("/delete-selected", async (req: AuthedRequest, res) => {
  const parsed = deleteSelectedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { count } = await prisma.telegramImportBatch.deleteMany({
    where: { createdBy: req.userId!, id: { in: parsed.data.batchIds } },
  });
  res.json({ deleted: count });
});

router.delete("/:batchId", async (req: AuthedRequest, res) => {
  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: String(req.params.batchId) } });
  if (!batch || batch.createdBy !== req.userId) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }
  await prisma.telegramImportBatch.delete({ where: { id: batch.id } });
  res.status(204).end();
});

export default router;
