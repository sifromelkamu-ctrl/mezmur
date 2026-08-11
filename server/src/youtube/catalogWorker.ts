import { prisma } from "../prisma.js";
import { DuplicateImportError, importYoutubeVideo } from "./pipeline.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { CancelledImportError, toSafeErrorMessage } from "./safeError.js";
import type { YoutubeImportItemStatus } from "../generated/prisma/enums.js";

// A single global FIFO of item ids, drained by up to CONCURRENCY parallel
// worker() loops — each one still serial-with-a-pause internally (see
// ITEM_DELAY_MS below). This used to be hardcoded to 1: 3 concurrent
// fetches plus only a 1.5s gap made a batch look exactly like a scraping
// burst to YouTube and got every single item bot-check-blocked in
// production, even from a bare (cookie-less) IP. Bumped back up now that
// yt-dlp carries real browser cookies (see ytdlp.ts's YTDLP_COOKIES_B64 /
// YTDLP_COOKIES_FROM_BROWSER) — an authenticated session reads as normal
// account activity rather than anonymous datacenter traffic, which is what
// the bot-check actually keys off. If imports start getting bot-blocked
// again, drop this back down first before touching anything else.
// Explicitly set for max throughput over stability — 5 concurrent already
// measurably strained this machine's network enough to intermittently break
// concurrent Supabase auth checks (login flakiness), and this is pushed
// well past that point on purpose. If login/other requests become
// unreliable during a big import, that's this tradeoff, not a new bug —
// drop this back down (2 was the last known-stable value) first.
const CONCURRENCY = 10;
const queue: string[] = [];
let activeWorkers = 0;

// Ids currently being worked on by processItem() in *this* process — as
// opposed to items merely marked "downloading"/etc. in the database, which
// could equally mean "actually running right now" or "orphaned because the
// process that owned it died". Resume logic checks this set so that calling
// resume (manually or at boot) is always safe: it only ever re-queues items
// that aren't genuinely in flight, never one this process is mid-pipeline on.
const inFlight = new Set<string>();

// One AbortController per item actually being worked on right now, so the
// admin's per-item "cancel" (X button) can kill the exact yt-dlp/ffmpeg
// process backing it — see cancelItem below. Populated/cleared in the same
// place as `inFlight`, just carrying the means to actually stop the work
// rather than only tracking that it's happening.
const inFlightControllers = new Map<string, AbortController>();

const ACTIVE_STATUSES: YoutubeImportItemStatus[] = ["selected", "downloading", "processing", "uploading", "saving"];

function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function enqueue(itemId: string) {
  if (!queue.includes(itemId)) queue.push(itemId);
  kick();
}

function enqueueItems(itemIds: string[]) {
  for (const id of itemIds) enqueue(id);
}

async function finalizeBatchIfDone(batchId: string) {
  const remaining = await prisma.youtubeImportItem.count({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
  });
  if (remaining > 0) return;

  // A batch the admin just stopped (see stopBatch below) also reaches zero
  // ACTIVE_STATUSES items once its last in-flight item finishes — but that's
  // not the same as finishing the batch, so only ever promote to a
  // completed/error terminal status from "importing".
  const batch = await prisma.youtubeImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (batch?.status !== "importing") return;

  const hasErrors = await prisma.youtubeImportItem.count({ where: { batchId, status: "error" } });
  await prisma.youtubeImportBatch.update({
    where: { id: batchId },
    data: { status: hasErrors > 0 ? "completed_with_errors" : "completed" },
  });
}

// Whether item.albumTitle was present in the batch's pre-import snapshot of
// the target artist's existing albums — null for singles (no album to ask
// about). Computed the same way regardless of outcome (imported or skipped
// as a duplicate) so it's available for the import summary either way; see
// YoutubeImportBatch.existingAlbumTitlesSnapshot for why this is a snapshot
// rather than a live "did I just create it" flag.
function computeAlbumWasNew(item: { albumTitle: string | null }, batch: { existingAlbumTitlesSnapshot: unknown }): boolean | null {
  if (!item.albumTitle) return null;
  const snapshot = Array.isArray(batch.existingAlbumTitlesSnapshot) ? (batch.existingAlbumTitlesSnapshot as string[]) : [];
  return !snapshot.includes(normalizeForMatch(item.albumTitle));
}

async function processItem(itemId: string) {
  const item = await prisma.youtubeImportItem.findUnique({ include: { batch: true }, where: { id: itemId } });
  if (!item || item.status !== "selected") return; // stale queue entry — already handled elsewhere

  inFlight.add(itemId);
  const controller = new AbortController();
  inFlightControllers.set(itemId, controller);
  try {
    // yt-dlp reports download progress many times per second — writing one
    // of these to Postgres on every single tick puts far more load on the
    // database (which Supabase Storage's own RLS checks also depend on)
    // than the UI actually needs. Throttled to at most once/second, plus
    // always on a status transition so stage changes are never dropped.
    let lastProgressWrite = 0;
    let lastStatus = "";
    const { dto } = await importYoutubeVideo({
      signal: controller.signal,
      url: buildWatchUrl(item.videoId),
      adminId: item.batch.createdBy,
      // targetArtistId is what every batch created going forward always
      // sets (the admin's explicit Existing/New Artist choice — see
      // routes/youtubeCatalogImport.ts); artistNameOverride is kept only as
      // a fallback for any batch left over from before that field existed.
      targetArtistId: item.batch.targetArtistId ?? undefined,
      artistNameOverride: item.batch.targetArtistId ? undefined : (item.batch.channelName ?? undefined),
      albumTitle: item.albumTitle ?? undefined,
      // An item with no albumTitle is exactly what the selection screen
      // itself already labels "Single" (see catalogEnumerate.ts's `kind`) —
      // without one of these two flags, it lands with albumId: null,
      // isSingle: false, AND isConcertSong: false, which is invisible
      // everywhere: no album to live in, not on the Singles page (that route
      // deliberately requires isSingle: true, never infers it from a null
      // albumId — see routes/singles.ts), and not in the Concerts feed
      // either (requires isConcertSong: true — see routes/concerts.ts).
      // Routed to whichever one matches this batch's own destination choice,
      // same as the single-video import's "Single" vs "Concert" destinations
      // already do. targetArtistId is already set by this point (the
      // admin's explicit artist choice), so isSingle here has no effect on
      // pipeline.ts's artist-resolution branch, which only consults it when
      // targetArtistId is absent.
      isSingle: item.batch.albumType !== "live" && !item.albumTitle,
      standaloneConcertSong: item.batch.albumType === "live" && !item.albumTitle,
      // The admin's "Regular Album" vs "Concert Album" destination choice
      // for this whole batch (see routes/youtubeCatalogImport.ts) — only
      // matters when albumTitle is set, and only actually applied to an
      // album findOrCreateAlbum ends up creating fresh (see pipeline.ts).
      albumType: item.batch.albumType,
      trackNumber: item.albumTitle ? item.position + 1 : undefined,
      skipArtwork: true,
      allowDuplicates: item.batch.allowDuplicates,
      batchId: item.batchId,
      onProgress: (status, progress, message) => {
        const now = Date.now();
        if (status === lastStatus && now - lastProgressWrite < 1000) return;
        lastStatus = status;
        lastProgressWrite = now;
        prisma.youtubeImportItem
          .update({ where: { id: itemId }, data: { status: status as YoutubeImportItemStatus, progress, message } })
          .catch(() => {});
      },
    });
    await prisma.youtubeImportItem.update({
      where: { id: itemId },
      data: {
        status: "done",
        progress: 100,
        message: "Imported",
        error: null,
        trackId: dto.id,
        trackWasNew: true,
        albumWasNew: computeAlbumWasNew(item, item.batch),
      },
    });
  } catch (err) {
    if (err instanceof DuplicateImportError) {
      await prisma.youtubeImportItem.update({
        where: { id: itemId },
        data: {
          status: "skipped_duplicate",
          progress: 0,
          message: "Already imported",
          error: null,
          trackWasNew: false,
          albumWasNew: computeAlbumWasNew(item, item.batch),
        },
      });
    } else if (err instanceof CancelledImportError) {
      // Admin-cancelled via the per-item X button — deselected, and marked
      // "cancelled" (not "pending") so the UI can show this was a
      // deliberate action rather than "never attempted".
      await prisma.youtubeImportItem.update({
        where: { id: itemId },
        data: { status: "cancelled", progress: 0, message: "Cancelled", error: null, selected: false },
      });
    } else {
      const message = toSafeErrorMessage(err, "Import failed", "youtube-catalog-import");
      await prisma.youtubeImportItem.update({
        where: { id: itemId },
        data: { status: "error", progress: 0, message: "Failed", error: message },
      });
    }
  } finally {
    inFlight.delete(itemId);
    inFlightControllers.delete(itemId);
    await finalizeBatchIfDone(item.batchId);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pulls the next id off the shared queue until it's empty, pausing between
// every item — long enough that a multi-item batch reads as ordinary,
// spaced-out usage rather than a scraping burst (see CONCURRENCY above for
// why this matters).
const ITEM_DELAY_MS = 500;

async function worker() {
  let itemId: string | undefined;
  while ((itemId = queue.shift()) !== undefined) {
    try {
      await processItem(itemId);
    } catch (err) {
      // processItem already catches everything from the actual import
      // itself (see its own try/catch around importYoutubeVideo) — this is
      // the backstop for anything before/after that, e.g. a transient DB
      // connectivity blip on the initial findUnique. Without this, that
      // rejection would go unhandled here (kick() only attaches .finally,
      // never .catch) and crash the whole Node process — taking down every
      // other route (including login) along with it, not just this import.
      console.error(`[catalogWorker] unexpected error processing item ${itemId}`, err);
    }
    if (queue.length > 0) await sleep(ITEM_DELAY_MS);
  }
}

// Tops the worker pool back up to CONCURRENCY whenever new items are
// enqueued or a worker finishes — synchronous on purpose (no internal
// await before activeWorkers++), so a burst of enqueue() calls in a tight
// loop (e.g. "select all" then "start") can never over-spawn workers.
function kick() {
  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    activeWorkers++;
    worker().finally(() => {
      activeWorkers--;
    });
  }
}

// Marks the admin's chosen items as queued and starts (or resumes) the
// worker on them. Only items in "pending" (never attempted) or "error"
// (previously failed — the admin re-checked it to retry) are picked up;
// anything already done, mid-flight, or a known duplicate is left alone.
export async function startBatchImport(batchId: string) {
  const items = await prisma.youtubeImportItem.findMany({
    where: { batchId, selected: true, status: { in: ["pending", "error"] } },
    select: { id: true },
  });
  if (items.length === 0) return 0;

  await prisma.youtubeImportItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "selected", progress: 0, error: null, message: "Queued…" },
  });
  await prisma.youtubeImportBatch.update({ where: { id: batchId }, data: { status: "importing" } });
  enqueueItems(items.map((i) => i.id));
  return items.length;
}

// Re-queues a batch's unfinished work — used both by the manual "Resume"
// endpoint and automatically at server boot (see resumeAllInterrupted) to
// pick interrupted imports back up. Items that were caught mid-pipeline when
// the process died are reset to "selected" so they're retried from scratch
// (we don't checkpoint partial downloads) rather than left stuck forever.
// Safe to call at any time, including on a batch that's genuinely still
// running: items this process is actually processing right now (inFlight)
// are never touched, so nothing already in progress gets yanked and re-run.
export async function resumeBatch(batchId: string) {
  const stuck = await prisma.youtubeImportItem.findMany({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  const toResume = stuck.filter((i) => !inFlight.has(i.id));
  if (toResume.length === 0) return 0;

  await prisma.youtubeImportItem.updateMany({
    where: { id: { in: toResume.map((i) => i.id) } },
    data: { status: "selected", progress: 0, message: "Queued…" },
  });
  await prisma.youtubeImportBatch.update({ where: { id: batchId }, data: { status: "importing" } });
  enqueueItems(toResume.map((i) => i.id));
  return toResume.length;
}

// Admin-triggered manual stop. Anything not yet actually running (still
// sitting in the in-memory queue) is pulled out and reset to "pending" —
// same state as freshly enumerated, never-selected items — so the batch
// drops back to the selection screen and the admin can review/reselect and
// hit "Start Import" again whenever they want. Whatever's genuinely
// mid-download right now (inFlight) is left alone to finish naturally:
// killing a running yt-dlp child process mid-fetch isn't safe to do here.
// With CONCURRENCY > 1 that can be a few items (up to CONCURRENCY, across
// any batch) rather than just one, but the logic doesn't assume a count —
// it just leaves whatever's actually in the inFlight set untouched.
export async function stopBatch(batchId: string) {
  const active = await prisma.youtubeImportItem.findMany({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  const toStop = active.filter((i) => !inFlight.has(i.id));

  for (const { id } of toStop) {
    const idx = queue.indexOf(id);
    if (idx !== -1) queue.splice(idx, 1);
  }

  if (toStop.length > 0) {
    await prisma.youtubeImportItem.updateMany({
      where: { id: { in: toStop.map((i) => i.id) } },
      data: { status: "pending", progress: 0, message: null },
    });
  }
  await prisma.youtubeImportBatch.update({ where: { id: batchId }, data: { status: "stopped" } });
  return toStop.length;
}

export type CancelItemResult = "removed_from_queue" | "aborted" | "not_active";

// Admin-triggered cancel for exactly one item (the import screen's per-item
// X button) — unlike stopBatch, this DOES kill a genuinely in-flight
// download: cancelItem targets one specific yt-dlp/ffmpeg process by id
// rather than "whatever happens to be running", so there's no ambiguity
// about collateral damage to a different item. If it hasn't started yet,
// it's just pulled out of the queue instead. Either way it lands at
// "cancelled" and deselected — via processItem's own CancelledImportError
// handling once the abort takes effect (for the in-flight case) or directly
// here (for the queued case).
export async function cancelItem(itemId: string): Promise<CancelItemResult> {
  const idx = queue.indexOf(itemId);
  if (idx !== -1 && !inFlight.has(itemId)) {
    queue.splice(idx, 1);
    const item = await prisma.youtubeImportItem.update({
      where: { id: itemId },
      data: { status: "cancelled", progress: 0, message: "Cancelled", error: null, selected: false },
    });
    await finalizeBatchIfDone(item.batchId);
    return "removed_from_queue";
  }

  const controller = inFlightControllers.get(itemId);
  if (controller) {
    controller.abort();
    return "aborted";
  }

  return "not_active";
}

// Called once at server startup: any batch left "importing" when the
// process last stopped had its items abandoned mid-queue (the in-memory
// queue array is gone) — this puts them back to work.
export async function resumeAllInterrupted() {
  const batches = await prisma.youtubeImportBatch.findMany({
    where: { status: "importing" },
    select: { id: true },
  });
  for (const batch of batches) await resumeBatch(batch.id);
}

// Self-healing watchdog. resumeAllInterrupted() above only runs once, at
// boot — it can't help an item that ends up marked active in Postgres
// (selected/downloading/etc.) but isn't actually in *this* process's queue
// or inFlight set while the server keeps running, e.g. a crash-and-restart
// race, two server instances briefly overlapping during a restart, or any
// future bug in enqueue timing. Until now the only fix for that was
// noticing and manually restarting the server — which is what today's
// "stuck, not started" incidents actually required. This re-syncs every
// still-"importing" batch against the DB on a timer instead, so an orphaned
// item gets picked back up automatically within WATCHDOG_INTERVAL_MS. Safe
// to run on a batch that's genuinely healthy: resumeBatch already excludes
// anything in `inFlight`, and enqueue() dedupes against the existing queue,
// so a normally-progressing batch is a no-op each tick.
const WATCHDOG_INTERVAL_MS = 30_000;
setInterval(() => {
  prisma.youtubeImportBatch
    .findMany({ where: { status: "importing" }, select: { id: true } })
    .then((batches) => Promise.all(batches.map((b) => resumeBatch(b.id))))
    .catch((err) => console.error("[catalogWorker] watchdog tick failed", err));
}, WATCHDOG_INTERVAL_MS).unref();
