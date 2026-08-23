import { Readable } from "node:stream";
import { prisma } from "../prisma.js";
import { headObject, publicArtworkUrl, r2Configured, streamToBucket } from "./r2.js";
import type { MediaKind, MediaMigrationStatus } from "../generated/prisma/enums.js";

// Supabase Storage -> Cloudflare R2, server-to-server. Runs entirely inside
// this already-deployed Render process — never the admin's own machine as a
// middleman (their Wi-Fi is unreliable and shouldn't be a dependency for
// moving 3,000+ files). Every step of state lives in the MediaMigrationJob
// table, not in memory, so "resume" is just "run another batch of pending
// jobs" — a server restart, a deploy, or the admin's browser/Mac
// disconnecting mid-run loses nothing, because nothing important was ever
// held only in this process's memory to begin with. The file bytes
// themselves are never fully materialized in this process's memory either
// — see migrateOne below, which streams Supabase's response body directly
// into R2 via streamToBucket rather than buffering.

// Kept intentionally small and sequential by default — this Render instance
// is 512MB total (see catalogWorker.ts's own concurrency comment for the
// exact OOM incident that taught that lesson the hard way). A batch of N
// jobs still only ever holds MIGRATION_CONCURRENCY files' bytes in flight
// at once, never all of N — and even that per-file footprint is now a
// streamed pipe, not a full in-memory buffer.
const MIGRATION_CONCURRENCY = Math.max(1, Number(process.env.MEDIA_MIGRATION_CONCURRENCY) || 1);

// A batch larger than this is refused until at least one job has actually
// reached "verified" — the small-test-before-full-migration gate. 5 is
// generous for "a small test" while still being nowhere near "the full
// catalog" by accident.
const TEST_GATE_THRESHOLD = 5;

// Temporary-failure retry policy — a genuinely transient blip (a dropped
// connection, a momentary 5xx from Supabase) gets a few fast-ish retries
// within the same job attempt; only after all of them fail does the job
// become "failed" for real, surfaced to the admin dashboard's manual retry.
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MigrationProgress {
  running: boolean;
  currentBatchSize: number;
  processedInBatch: number;
  bytesTransferredInBatch: number;
  batchStartedAt: string | null;
  // { mediaKind, entityId } for every job an active worker is on right now
  // — a real "current file" signal even with MIGRATION_CONCURRENCY > 1.
  inFlight: { mediaKind: MediaKind; entityId: string }[];
  lastError: string | null;
}

// Single in-memory object so two /run calls can't race each other into
// double-processing the same batch — NOT the source of truth for what's
// migrated (the DB is), just a "don't start a second run while one's
// already going" guard plus a live progress readout. Safe to lose on
// restart: a run that was interrupted mid-batch just leaves its in-flight
// job(s) at "transferring"/"retrying", which the next /run picks back up
// (see runMigrationBatch's own query) rather than skipping them — this
// object resets to idle, but no migration state is lost, because none of
// it lived only here.
let progress: MigrationProgress = {
  running: false,
  currentBatchSize: 0,
  processedInBatch: 0,
  bytesTransferredInBatch: 0,
  batchStartedAt: null,
  inFlight: [],
  lastError: null,
};

export function getMigrationProgress(): MigrationProgress {
  return progress;
}

interface DiscoveredMedia {
  mediaKind: MediaKind;
  entityId: string;
  sourceUrl: string;
  destinationKey: string;
}

function extFromUrl(url: string, fallback: string): string {
  const match = /\.[a-zA-Z0-9]{2,5}(?:\?|$)/.exec(url);
  return match ? match[0].replace(/\?.*$/, "") : fallback;
}

// Enumerates every existing media file still on Supabase (audioStorageKey /
// coverStorageKey / photoStorageKey null, but a legacy *Url set) and
// upserts one MediaMigrationJob per file — pure bookkeeping, touches no
// actual files (no HEAD/GET against Supabase or R2 either — file sizes are
// learned lazily, the first time a job actually runs, rather than a slow
// full-catalog HEAD sweep up front; see runMigrationBatch's own size
// bookkeeping). Safe to call repeatedly (e.g. after new content gets
// imported): existing jobs for already-covered entities are left alone via
// the (mediaKind, entityId) unique constraint, so this only ever adds rows
// for genuinely new media, never duplicates or resets progress on old ones.
export async function discoverPendingMedia(): Promise<{ discovered: number }> {
  const found: DiscoveredMedia[] = [];

  const tracks = await prisma.track.findMany({
    where: { OR: [{ audioUrl: { not: null }, audioStorageKey: null }, { coverUrl: { not: null }, coverStorageKey: null, albumId: null }] },
    select: { id: true, audioUrl: true, audioStorageKey: true, coverUrl: true, coverStorageKey: true, albumId: true },
  });
  for (const t of tracks) {
    if (t.audioUrl && !t.audioStorageKey) {
      found.push({
        mediaKind: "track_audio",
        entityId: t.id,
        sourceUrl: t.audioUrl,
        destinationKey: `audio/tracks/${t.id}${extFromUrl(t.audioUrl, ".mp3")}`,
      });
    }
    // Album Artwork Is Master Artwork — only a standalone single (no album)
    // has its own coverUrl worth migrating; an album track's is always
    // resolved from the album instead (see toTrackDTO), so migrating it
    // separately here would just migrate a file nothing ever reads.
    if (!t.albumId && t.coverUrl && !t.coverStorageKey) {
      found.push({
        mediaKind: "track_cover",
        entityId: t.id,
        sourceUrl: t.coverUrl,
        destinationKey: `artwork/tracks/${t.id}${extFromUrl(t.coverUrl, ".jpg")}`,
      });
    }
  }

  const albums = await prisma.album.findMany({
    where: { coverUrl: { not: null }, coverStorageKey: null },
    select: { id: true, coverUrl: true },
  });
  for (const a of albums) {
    found.push({
      mediaKind: "album_cover",
      entityId: a.id,
      sourceUrl: a.coverUrl!,
      destinationKey: `artwork/albums/${a.id}${extFromUrl(a.coverUrl!, ".jpg")}`,
    });
  }

  const artists = await prisma.artist.findMany({
    where: { photoUrl: { not: null }, photoStorageKey: null },
    select: { id: true, photoUrl: true },
  });
  for (const ar of artists) {
    found.push({
      mediaKind: "artist_photo",
      entityId: ar.id,
      sourceUrl: ar.photoUrl!,
      destinationKey: `artwork/artists/${ar.id}${extFromUrl(ar.photoUrl!, ".jpg")}`,
    });
  }

  const playlists = await prisma.playlist.findMany({
    where: { coverUrl: { not: null }, coverStorageKey: null },
    select: { id: true, coverUrl: true },
  });
  for (const p of playlists) {
    found.push({
      mediaKind: "playlist_cover",
      entityId: p.id,
      sourceUrl: p.coverUrl!,
      destinationKey: `artwork/playlists/${p.id}${extFromUrl(p.coverUrl!, ".jpg")}`,
    });
  }

  // createMany + skipDuplicates rather than a per-item upsert loop: one
  // round-trip instead of N, and `count` is the DB's own authoritative
  // count of rows actually inserted — no reliance on comparing
  // createdAt/updatedAt timestamps to infer "was this genuinely new" (that
  // comparison turned out unreliable: Prisma doesn't necessarily touch
  // updatedAt on a no-op `update: {}`, so a second scan with nothing new to
  // find was miscounting every already-tracked file as freshly discovered).
  const result = await prisma.mediaMigrationJob.createMany({
    data: found.map((item) => ({ ...item, status: "pending" as const })),
    skipDuplicates: true,
  });

  return { discovered: result.count };
}

async function updateEntityStorageKey(mediaKind: MediaKind, entityId: string, key: string, publicUrl: string): Promise<void> {
  switch (mediaKind) {
    case "track_audio":
      // Deliberately does NOT set audioUrl — R2 audio has no permanent
      // public URL by design (see Track.audioStorageKey's doc comment in
      // schema.prisma). Real playback goes through routes/tracks.ts's
      // signed /:id/stream-url instead.
      await prisma.track.update({ where: { id: entityId }, data: { audioStorageKey: key } });
      return;
    case "track_cover":
      await prisma.track.update({ where: { id: entityId }, data: { coverStorageKey: key, coverUrl: publicUrl } });
      return;
    case "album_cover":
      await prisma.album.update({ where: { id: entityId }, data: { coverStorageKey: key, coverUrl: publicUrl } });
      return;
    case "artist_photo":
      await prisma.artist.update({ where: { id: entityId }, data: { photoStorageKey: key, photoUrl: publicUrl } });
      return;
    case "playlist_cover":
      await prisma.playlist.update({ where: { id: entityId }, data: { coverStorageKey: key, coverUrl: publicUrl } });
      return;
  }
}

async function setStatus(id: string, status: MediaMigrationStatus, extra?: Record<string, unknown>) {
  await prisma.mediaMigrationJob.update({ where: { id }, data: { status, ...extra } });
}

// One attempt: fetch from Supabase, stream straight into R2 (never fully
// buffered — see streamToBucket), HEAD-verify the byte count landed right.
// Throws on any failure; the retry loop in migrateOne is what decides
// whether that's worth trying again.
async function attemptTransfer(job: {
  mediaKind: MediaKind;
  sourceUrl: string;
  destinationKey: string;
}): Promise<{ bytes: number; publicUrl: string }> {
  const res = await fetch(job.sourceUrl);
  if (!res.ok || !res.body) throw new Error(`Source fetch failed: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? (job.mediaKind === "track_audio" ? "audio/mpeg" : "image/jpeg");
  const declaredLength = Number(res.headers.get("content-length")) || undefined;

  const bucket = job.mediaKind === "track_audio" ? "audio" : "artwork";
  // Readable.fromWeb bridges undici's Web ReadableStream (what Node's own
  // fetch returns) into the Node stream @aws-sdk/lib-storage's Upload
  // expects — the bytes flow Supabase -> this pipe -> R2 without ever
  // sitting fully in a Buffer in between.
  await streamToBucket(bucket, job.destinationKey, Readable.fromWeb(res.body as never), contentType);

  const info = await headObject(bucket, job.destinationKey);
  if (!info) throw new Error("Verification failed: R2 reports the object missing after upload");
  if (declaredLength && info.sizeBytes !== declaredLength) {
    throw new Error(`Verification failed: source reported ${declaredLength} bytes, R2 has ${info.sizeBytes}`);
  }

  const publicUrl = job.mediaKind === "track_audio" ? "" : publicArtworkUrl(job.destinationKey);
  return { bytes: info.sizeBytes, publicUrl };
}

// Migrates exactly one job, retrying transient failures with exponential
// backoff before giving up for real (see RETRY_ATTEMPTS/RETRY_BASE_DELAY_MS
// above). Never throws — always resolves, recording success or failure on
// the job row itself, so a batch loop can keep going through the rest of a
// batch even when one file's every attempt fails.
async function migrateOne(job: {
  id: string;
  mediaKind: MediaKind;
  entityId: string;
  sourceUrl: string;
  destinationKey: string;
}): Promise<{ ok: boolean; bytes: number }> {
  progress.inFlight.push({ mediaKind: job.mediaKind, entityId: job.entityId });
  await setStatus(job.id, "transferring");

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const { bytes, publicUrl } = await attemptTransfer(job);
      await updateEntityStorageKey(job.mediaKind, job.entityId, job.destinationKey, publicUrl);
      await setStatus(job.id, "verified", { fileSize: bytes, migratedAt: new Date(), verifiedAt: new Date(), errorMessage: null });
      progress.inFlight = progress.inFlight.filter((f) => !(f.mediaKind === job.mediaKind && f.entityId === job.entityId));
      return { ok: true, bytes };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_ATTEMPTS) {
        await setStatus(job.id, "retrying", { errorMessage: lastError, retryCount: { increment: 1 } });
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  await setStatus(job.id, "failed", { errorMessage: lastError, retryCount: { increment: 1 } });
  progress.inFlight = progress.inFlight.filter((f) => !(f.mediaKind === job.mediaKind && f.entityId === job.entityId));
  return { ok: false, bytes: 0 };
}

// Validation only, deliberately split out from runMigrationBatch below so
// the admin route can await just this fast part (no file transfer, one
// cheap count query at most) and return a real error immediately — a batch
// itself can take minutes, so the route never awaits that part, which used
// to mean even an instant validation failure (already running, test gate
// not satisfied) silently only showed up in server logs, never in the
// response the admin actually saw.
//
// Enforces the small-test-first rule: refuses a batch above
// TEST_GATE_THRESHOLD until at least one job has ever actually reached
// "verified" — see routes/adminMediaMigration.ts's /test for the intended
// way to satisfy this gate deliberately, rather than the admin having to
// know the magic threshold number themselves.
export async function assertCanStartBatch(batchSize: number): Promise<void> {
  if (!r2Configured) throw new Error("R2 is not configured — cannot migrate until R2_* env vars are set");
  if (progress.running) throw new Error("A migration batch is already running");
  if (batchSize > TEST_GATE_THRESHOLD) {
    const verifiedCount = await prisma.mediaMigrationJob.count({ where: { status: "verified" } });
    if (verifiedCount === 0) {
      throw new Error(
        `Run a small test first (${TEST_GATE_THRESHOLD} files or fewer) — no job has been verified yet, so a larger batch is refused.`
      );
    }
  }
}

// Runs one bounded batch (pending jobs, plus any orphaned transferring/
// retrying ones left behind by an interrupted previous run) and returns
// once the whole batch is done. Callers that want this to run in the
// background (the admin route) should call assertCanStartBatch first,
// await that, then fire this off WITHOUT awaiting it, and let the client
// poll getMigrationProgress() instead — a real batch can take minutes.
export async function runMigrationBatch(batchSize: number): Promise<void> {
  await assertCanStartBatch(batchSize);
  // Flips synchronously (no await between the check above resolving and
  // this line) so a request that arrives immediately after sees
  // progress.running already true, rather than both racing past the check.
  progress.running = true;

  const jobs = await prisma.mediaMigrationJob.findMany({
    where: { status: { in: ["pending", "transferring", "retrying"] } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  progress = {
    running: true,
    currentBatchSize: jobs.length,
    processedInBatch: 0,
    bytesTransferredInBatch: 0,
    batchStartedAt: new Date().toISOString(),
    inFlight: [],
    lastError: null,
  };

  try {
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const result = await migrateOne(job);
        progress.processedInBatch++;
        if (result.ok) progress.bytesTransferredInBatch += result.bytes;
      }
    }
    await Promise.all(Array.from({ length: Math.min(MIGRATION_CONCURRENCY, jobs.length) }, worker));
  } catch (err) {
    progress.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    progress.running = false;
  }
}

// Retries every job currently marked failed by resetting it to pending —
// the next /run batch picks these up same as any other pending job. Doesn't
// re-attempt verified/completed/skipped jobs.
export async function resetFailedJobs(): Promise<{ reset: number }> {
  const result = await prisma.mediaMigrationJob.updateMany({
    where: { status: "failed" },
    data: { status: "pending" },
  });
  return { reset: result.count };
}

export async function getMigrationSummary() {
  const counts = await prisma.mediaMigrationJob.groupBy({ by: ["status"], _count: true });
  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c._count;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  // Estimated total bytes across every job, not just this batch — exact for
  // jobs already migrated (their real fileSize), extrapolated for the rest
  // from the average size observed so far. Deliberately not a precise
  // up-front figure: getting one would mean a HEAD request per file during
  // discovery (thousands of round-trips before a "read-only scan" could
  // even finish), which isn't worth it just to firm up one progress number.
  const sizeStats = await prisma.mediaMigrationJob.aggregate({
    where: { fileSize: { not: null } },
    _sum: { fileSize: true },
    _avg: { fileSize: true },
    _count: { fileSize: true },
  });
  const knownBytes = sizeStats._sum.fileSize ?? 0;
  const knownCount = sizeStats._count.fileSize;
  const avgBytes = sizeStats._avg.fileSize ?? 0;
  const unknownCount = total - knownCount;
  const estimatedTotalBytes = knownCount > 0 ? Math.round(knownBytes + avgBytes * unknownCount) : null;

  return { total, byStatus, progress, bytesMigratedSoFar: knownBytes, estimatedTotalBytes };
}
