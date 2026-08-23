import { prisma } from "../prisma.js";
import { headObject, publicArtworkUrl, putArtworkObject, putAudioObject, r2Configured } from "./r2.js";
import type { MediaKind } from "../generated/prisma/enums.js";

// Supabase Storage -> Cloudflare R2, server-to-server. Runs entirely inside
// this already-deployed Render process — never the admin's own machine as a
// middleman (their Wi-Fi is unreliable and shouldn't be a dependency for
// moving 3,000+ files). Every step of state lives in the MediaMigrationJob
// table, not in memory, so "resume" is just "run another batch of pending
// jobs" — a server restart, a deploy, or the admin's browser/Mac
// disconnecting mid-run loses nothing, because nothing important was ever
// held only in this process's memory to begin with.

// Kept intentionally small and sequential by default — this Render instance
// is 512MB total (see catalogWorker.ts's own concurrency comment for the
// exact OOM incident that taught that lesson the hard way). A batch of N
// jobs still only ever holds MIGRATION_CONCURRENCY files' bytes in memory
// at once, never all of N.
const MIGRATION_CONCURRENCY = Math.max(1, Number(process.env.MEDIA_MIGRATION_CONCURRENCY) || 1);

export interface MigrationProgress {
  running: boolean;
  currentBatchSize: number;
  processedInBatch: number;
  lastError: string | null;
  startedAt: string | null;
}

// Single in-memory flag so two /run calls can't race each other into
// double-processing the same batch — NOT the source of truth for what's
// migrated (the DB is), just a "don't start a second run while one's
// already going" guard. Safe to lose on restart: a run that was
// interrupted mid-batch just leaves its in-flight job(s) at "processing",
// which a later /run picks back up (see runBatch's own pending+processing
// query) rather than skipping them.
let progress: MigrationProgress = {
  running: false,
  currentBatchSize: 0,
  processedInBatch: 0,
  lastError: null,
  startedAt: null,
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
// actual files. Safe to call repeatedly (e.g. after new content gets
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

  let discovered = 0;
  for (const item of found) {
    const result = await prisma.mediaMigrationJob.upsert({
      where: { mediaKind_entityId: { mediaKind: item.mediaKind, entityId: item.entityId } },
      update: {},
      create: { ...item, status: "pending" },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) discovered++;
  }

  return { discovered };
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

// Migrates exactly one job: download from Supabase (still fully intact and
// untouched afterward — this never deletes or modifies the source), upload
// to the correct R2 bucket, HEAD-verify the size landed right, then flip
// this entity's row over to the R2 key. Never throws — always resolves,
// recording success or failure on the job row itself, so a batch loop can
// keep going through the rest of a batch even when one file fails.
async function migrateOne(job: { id: string; mediaKind: MediaKind; entityId: string; sourceUrl: string; destinationKey: string; retryCount: number }): Promise<void> {
  await prisma.mediaMigrationJob.update({ where: { id: job.id }, data: { status: "processing" } });
  try {
    const res = await fetch(job.sourceUrl);
    if (!res.ok) throw new Error(`Source fetch failed: HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? (job.mediaKind === "track_audio" ? "audio/mpeg" : "image/jpeg");
    const buffer = Buffer.from(await res.arrayBuffer());

    let publicUrl = "";
    if (job.mediaKind === "track_audio") {
      await putAudioObject(job.destinationKey, buffer, contentType);
    } else {
      await putArtworkObject(job.destinationKey, buffer, contentType);
      publicUrl = publicArtworkUrl(job.destinationKey);
    }

    const info = await headObject(job.mediaKind === "track_audio" ? "audio" : "artwork", job.destinationKey);
    if (!info || info.sizeBytes !== buffer.length) {
      throw new Error(`Verification failed: expected ${buffer.length} bytes, R2 reports ${info?.sizeBytes ?? "missing"}`);
    }

    await updateEntityStorageKey(job.mediaKind, job.entityId, job.destinationKey, publicUrl);
    await prisma.mediaMigrationJob.update({
      where: { id: job.id },
      data: { status: "verified", fileSize: buffer.length, migratedAt: new Date(), verifiedAt: new Date(), errorMessage: null },
    });
  } catch (err) {
    await prisma.mediaMigrationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        retryCount: { increment: 1 },
      },
    });
  }
}

// Runs one bounded batch (pending jobs, plus any orphaned "processing" ones
// left behind by an interrupted previous run — see the module-level comment
// on `progress`) and returns once the whole batch is done. Callers that want
// this to run in the background (the admin route) should NOT await this
// directly on the request — kick it off and let the client poll
// getMigrationProgress() instead, since a real batch can take minutes.
export async function runMigrationBatch(batchSize: number): Promise<void> {
  if (!r2Configured) throw new Error("R2 is not configured — cannot migrate until R2_* env vars are set");
  if (progress.running) throw new Error("A migration batch is already running");

  const jobs = await prisma.mediaMigrationJob.findMany({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  progress = { running: true, currentBatchSize: jobs.length, processedInBatch: 0, lastError: null, startedAt: new Date().toISOString() };

  try {
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        await migrateOne(job);
        progress.processedInBatch++;
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
  return { total, byStatus, progress };
}
