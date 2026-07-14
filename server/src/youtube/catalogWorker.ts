import { prisma } from "../prisma.js";
import { DuplicateImportError, importYoutubeVideo } from "./pipeline.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { toSafeErrorMessage } from "./safeError.js";
import type { YoutubeImportItemStatus } from "../generated/prisma/enums.js";

// A single global FIFO of item ids. Each item spends almost all of its time
// waiting on network I/O (yt-dlp fetching through the configured proxy —
// see ytdlp.ts's YTDLP_PROXY_URL — not on CPU), so running a few at once is
// safe even on a modest instance and directly cuts total batch wall-clock
// time: a free-tier proxy's throughput was observed in production to vary
// a lot (a healthy download: ~10s; a congested one: several minutes before
// yt-dlp's own retries gave up), and previously every item queued fully
// behind whichever one it happened to land on.
const CONCURRENCY = 3;
const queue: string[] = [];
let activeWorkers = 0;

// Ids currently being worked on by processItem() in *this* process — as
// opposed to items merely marked "downloading"/etc. in the database, which
// could equally mean "actually running right now" or "orphaned because the
// process that owned it died". Resume logic checks this set so that calling
// resume (manually or at boot) is always safe: it only ever re-queues items
// that aren't genuinely in flight, never one this process is mid-pipeline on.
const inFlight = new Set<string>();

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
  try {
    // yt-dlp reports download progress many times per second — writing one
    // of these to Postgres on every single tick puts far more load on the
    // database (which Supabase Storage's own RLS checks also depend on)
    // than the UI actually needs. Throttled to at most once/second, plus
    // always on a status transition so stage changes are never dropped.
    let lastProgressWrite = 0;
    let lastStatus = "";
    const { dto } = await importYoutubeVideo({
      url: buildWatchUrl(item.videoId),
      adminId: item.batch.createdBy,
      // targetArtistId is what every batch created going forward always
      // sets (the admin's explicit Existing/New Artist choice — see
      // routes/youtubeCatalogImport.ts); artistNameOverride is kept only as
      // a fallback for any batch left over from before that field existed.
      targetArtistId: item.batch.targetArtistId ?? undefined,
      artistNameOverride: item.batch.targetArtistId ? undefined : (item.batch.channelName ?? undefined),
      albumTitle: item.albumTitle ?? undefined,
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
    } else {
      const message = toSafeErrorMessage(err, "Import failed", "youtube-catalog-import");
      await prisma.youtubeImportItem.update({
        where: { id: itemId },
        data: { status: "error", progress: 0, message: "Failed", error: message },
      });
    }
  } finally {
    inFlight.delete(itemId);
    await finalizeBatchIfDone(item.batchId);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Each worker greedily pulls the next id off the shared queue until it's
// empty — queue.shift() is synchronous, so concurrent workers can never
// grab the same item. The pause between an individual worker's own items
// is shorter than the old single-worker version's (1.5s vs 3s) since
// CONCURRENCY workers already naturally space out storage API calls
// against each other; it's not trying to throttle the batch as a whole.
async function worker() {
  let itemId: string | undefined;
  while ((itemId = queue.shift()) !== undefined) {
    await processItem(itemId);
    if (queue.length > 0) await sleep(1500);
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
