// See telegram/client.ts for why this needs the explicit /index.js.
import { FloodWaitError } from "teleproto/errors/index.js";
import { prisma } from "../prisma.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { DuplicateImportError } from "../catalogImport/shared.js";
import { CancelledImportError, toSafeErrorMessage } from "../youtube/safeError.js";
import { importTelegramAudio } from "./pipeline.js";
import { extractTelegramChannelUsername } from "./validate.js";
import type { TelegramImportItemStatus } from "../generated/prisma/enums.js";

// Structurally identical to youtube/catalogWorker.ts's in-memory FIFO —
// see that file for the reasoning behind the shared-queue/per-item-delay
// design. Concurrency starts far more conservative than YouTube's (10):
// Telegram's rate limiting is a hard, server-directed FLOOD_WAIT_X backoff
// (see the FloodWaitError handling in processItem below) rather than a soft
// bot-check, so there's no equivalent of "authenticated cookies make this
// look like normal traffic" to lean on — staying well under any flood-wait
// threshold in the first place is the only lever available.
const CONCURRENCY = 3;
const queue: string[] = [];
let activeWorkers = 0;

const inFlight = new Set<string>();
const inFlightControllers = new Map<string, AbortController>();

const ACTIVE_STATUSES: TelegramImportItemStatus[] = ["selected", "downloading", "processing", "uploading", "saving"];

// How many times a single item is allowed to retry after a FLOOD_WAIT before
// giving up and surfacing a real error — otherwise a channel that keeps
// tripping Telegram's rate limit would retry the same item forever.
const MAX_FLOOD_WAIT_RETRIES = 3;
const floodWaitRetries = new Map<string, number>();

function enqueue(itemId: string) {
  if (!queue.includes(itemId)) queue.push(itemId);
  kick();
}

function enqueueItems(itemIds: string[]) {
  for (const id of itemIds) enqueue(id);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function finalizeBatchIfDone(batchId: string) {
  const remaining = await prisma.telegramImportItem.count({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
  });
  if (remaining > 0) return;

  const batch = await prisma.telegramImportBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (batch?.status !== "importing") return;

  const hasErrors = await prisma.telegramImportItem.count({ where: { batchId, status: "error" } });
  await prisma.telegramImportBatch.update({
    where: { id: batchId },
    data: { status: hasErrors > 0 ? "completed_with_errors" : "completed" },
  });
}

function computeAlbumWasNew(item: { albumTitle: string | null }, batch: { existingAlbumTitlesSnapshot: unknown }): boolean | null {
  if (!item.albumTitle) return null;
  const snapshot = Array.isArray(batch.existingAlbumTitlesSnapshot) ? (batch.existingAlbumTitlesSnapshot as string[]) : [];
  return !snapshot.includes(normalizeForMatch(item.albumTitle));
}

async function processItem(itemId: string) {
  const item = await prisma.telegramImportItem.findUnique({ include: { batch: true }, where: { id: itemId } });
  if (!item || item.status !== "selected") return; // stale queue entry — already handled elsewhere

  const channelUsername = extractTelegramChannelUsername(item.batch.sourceUrl);
  if (!channelUsername) {
    await prisma.telegramImportItem.update({
      where: { id: itemId },
      data: { status: "error", progress: 0, message: "Failed", error: "This batch's channel link is no longer valid" },
    });
    await finalizeBatchIfDone(item.batchId);
    return;
  }

  inFlight.add(itemId);
  const controller = new AbortController();
  inFlightControllers.set(itemId, controller);
  try {
    let lastProgressWrite = 0;
    let lastStatus = "";
    const { dto } = await importTelegramAudio({
      signal: controller.signal,
      channelUsername,
      messageId: item.messageId,
      title: item.title,
      duration: item.duration,
      adminId: item.batch.createdBy,
      targetArtistId: item.batch.targetArtistId!,
      albumTitle: item.albumTitle,
      allowDuplicates: item.batch.allowDuplicates,
      batchId: item.batchId,
      onProgress: (status, progress, message) => {
        const now = Date.now();
        if (status === lastStatus && now - lastProgressWrite < 1000) return;
        lastStatus = status;
        lastProgressWrite = now;
        prisma.telegramImportItem
          .update({ where: { id: itemId }, data: { status: status as TelegramImportItemStatus, progress, message } })
          .catch(() => {});
      },
    });
    floodWaitRetries.delete(itemId);
    await prisma.telegramImportItem.update({
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
    if (err instanceof FloodWaitError) {
      const attempts = (floodWaitRetries.get(itemId) ?? 0) + 1;
      floodWaitRetries.set(itemId, attempts);
      if (attempts > MAX_FLOOD_WAIT_RETRIES) {
        floodWaitRetries.delete(itemId);
        await prisma.telegramImportItem.update({
          where: { id: itemId },
          data: {
            status: "error",
            progress: 0,
            message: "Failed",
            error: `Telegram is rate-limiting this account (still flood-waited after ${MAX_FLOOD_WAIT_RETRIES} retries) — try again later.`,
          },
        });
      } else {
        console.warn(`[telegramWorker] FLOOD_WAIT_${err.seconds} on item ${itemId} (attempt ${attempts}/${MAX_FLOOD_WAIT_RETRIES}) — retrying after backoff`);
        await prisma.telegramImportItem.update({
          where: { id: itemId },
          data: { status: "selected", progress: 0, message: `Rate-limited by Telegram, retrying in ${err.seconds}s…` },
        });
        // Sleeping here (rather than just re-enqueueing immediately) holds
        // this worker slot idle for the wait — deliberately, since hammering
        // Telegram with other items from the same account during a flood
        // wait only makes the block worse.
        await sleep(Math.min(err.seconds, 300) * 1000);
        enqueue(itemId);
      }
    } else if (err instanceof DuplicateImportError) {
      await prisma.telegramImportItem.update({
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
      await prisma.telegramImportItem.update({
        where: { id: itemId },
        data: { status: "cancelled", progress: 0, message: "Cancelled", error: null, selected: false },
      });
    } else {
      const message = toSafeErrorMessage(err, "Import failed", "telegram-import");
      await prisma.telegramImportItem.update({
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

const ITEM_DELAY_MS = 1500;

async function worker() {
  let itemId: string | undefined;
  while ((itemId = queue.shift()) !== undefined) {
    try {
      await processItem(itemId);
    } catch (err) {
      console.error(`[telegramWorker] unexpected error processing item ${itemId}`, err);
    }
    if (queue.length > 0) await sleep(ITEM_DELAY_MS);
  }
}

function kick() {
  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    activeWorkers++;
    worker().finally(() => {
      activeWorkers--;
    });
  }
}

export async function startBatchImport(batchId: string) {
  const items = await prisma.telegramImportItem.findMany({
    where: { batchId, selected: true, status: { in: ["pending", "error"] } },
    select: { id: true },
  });
  if (items.length === 0) return 0;

  await prisma.telegramImportItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "selected", progress: 0, error: null, message: "Queued…" },
  });
  await prisma.telegramImportBatch.update({ where: { id: batchId }, data: { status: "importing" } });
  enqueueItems(items.map((i) => i.id));
  return items.length;
}

export async function resumeBatch(batchId: string) {
  const stuck = await prisma.telegramImportItem.findMany({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  const toResume = stuck.filter((i) => !inFlight.has(i.id));
  if (toResume.length === 0) return 0;

  await prisma.telegramImportItem.updateMany({
    where: { id: { in: toResume.map((i) => i.id) } },
    data: { status: "selected", progress: 0, message: "Queued…" },
  });
  await prisma.telegramImportBatch.update({ where: { id: batchId }, data: { status: "importing" } });
  enqueueItems(toResume.map((i) => i.id));
  return toResume.length;
}

export async function stopBatch(batchId: string) {
  const active = await prisma.telegramImportItem.findMany({
    where: { batchId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  const toStop = active.filter((i) => !inFlight.has(i.id));

  for (const { id } of toStop) {
    const idx = queue.indexOf(id);
    if (idx !== -1) queue.splice(idx, 1);
  }

  if (toStop.length > 0) {
    await prisma.telegramImportItem.updateMany({
      where: { id: { in: toStop.map((i) => i.id) } },
      data: { status: "pending", progress: 0, message: null },
    });
  }
  await prisma.telegramImportBatch.update({ where: { id: batchId }, data: { status: "stopped" } });
  return toStop.length;
}

export type CancelItemResult = "removed_from_queue" | "aborted" | "not_active";

export async function cancelItem(itemId: string): Promise<CancelItemResult> {
  const idx = queue.indexOf(itemId);
  if (idx !== -1 && !inFlight.has(itemId)) {
    queue.splice(idx, 1);
    const item = await prisma.telegramImportItem.update({
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

// Called once at server startup — see index.ts.
export async function resumeAllInterrupted() {
  const batches = await prisma.telegramImportBatch.findMany({
    where: { status: "importing" },
    select: { id: true },
  });
  for (const batch of batches) await resumeBatch(batch.id);
}

// Self-healing watchdog — see the matching comment in youtube/catalogWorker.ts.
// Re-syncs every still-"importing" Telegram batch against the DB on a
// timer, so an item stranded active in Postgres without actually being in
// this process's queue/inFlight (crash-restart race, etc.) gets re-queued
// automatically instead of needing a manual server restart to notice.
const WATCHDOG_INTERVAL_MS = 30_000;
setInterval(() => {
  prisma.telegramImportBatch
    .findMany({ where: { status: "importing" }, select: { id: true } })
    .then((batches) => Promise.all(batches.map((b) => resumeBatch(b.id))))
    .catch((err) => console.error("[telegram/worker] watchdog tick failed", err));
}, WATCHDOG_INTERVAL_MS).unref();
