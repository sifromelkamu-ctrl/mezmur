import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";
import { uploadImageToStorage } from "../upload.js";
import { gradientForSeed } from "../routes/admin.js";
import { normalizeForMatch, similarity } from "../artwork/matching.js";
import { createAudioUploadUrl, r2Configured } from "../storage/r2.js";
import type { AlbumType } from "../generated/prisma/enums.js";

// Source-agnostic pieces of the catalog-import pipeline, shared between
// youtube/pipeline.ts and telegram/pipeline.ts so artist/album resolution,
// image import, and the signed-upload dance only ever live in one place.

// Same bar used elsewhere (artwork/matching.ts, spotifySync/sync.ts) for
// fuzzy title matching — also the threshold each pipeline's own duplicate
// checks (by track title, not just sourceId) are expected to use.
export const IDENTITY_MIN = 0.55;

// Thrown when a source item (a YouTube video, a Telegram audio message) has
// already been imported (matched by sourceId). Kept distinct from a generic
// Error so callers — the quick single-item job and the catalog batch worker,
// for either source — can tell "already have this one" apart from a real
// failure and react differently (e.g. mark a catalog item skipped_duplicate
// instead of error).
export class DuplicateImportError extends Error {
  constructor(public readonly sourceId: string) {
    super("This item has already been imported");
    this.name = "DuplicateImportError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Where a freshly-minted audio upload target should end up — the single
// choke point every audio-uploading call site (admin's quick upload, song
// submissions, the YouTube and Telegram import pipelines) goes through, so
// "Supabase vs R2" is decided in exactly one place rather than four. None of
// these four know or care which provider they got; they PUT to `signedUrl`
// same as always, then pass this same object to resolveAudioUploadResult
// once the upload finishes to get back whatever the Track row should save.
export interface AudioUploadTarget {
  signedUrl: string;
  provider: "r2" | "supabase";
  key: string;
}

// createSignedUploadUrl (the Supabase path below) has been observed to
// intermittently fail with a spurious "row-level security policy" error
// under sustained back-to-back use (a fresh call with identical arguments in
// isolation succeeds every time) — retried with exponential backoff before
// giving up for real, so a run of transient blips doesn't fail an otherwise-
// successful import. R2's presigned PUT URLs are generated locally (no
// network round-trip, nothing to retry) so this only applies to the
// Supabase branch.
export async function createAudioUploadTarget(fileExt = ".mp3", attempts = 7): Promise<AudioUploadTarget> {
  const ext = fileExt.startsWith(".") ? fileExt : `.${fileExt}`;

  if (r2Configured) {
    const key = `audio/tracks/${randomUUID()}${ext}`;
    const signedUrl = await createAudioUploadUrl(key);
    return { signedUrl, provider: "r2", key };
  }

  const path = `${randomUUID()}${ext}`;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await supabaseAdmin.storage.from("audio-tracks").createSignedUploadUrl(path);
    if (!error && data) return { signedUrl: data.signedUrl, provider: "supabase", key: path };
    lastError = error?.message ?? lastError;
    if (attempt < attempts) await sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
  throw new Error(`Could not create upload URL: ${lastError}`);
}

// Resolves a target into what the Track row should actually save, once the
// upload itself has completed. R2: audioStorageKey only — audioUrl stays
// null forever, since R2 audio has no permanent public URL by design; real
// playback always goes through the signed GET.../:id/play endpoint instead
// (see routes/tracks.ts). Supabase: audioUrl only, exactly as it's always
// worked, via the same getPublicUrl call this replaced.
export function resolveAudioUploadResult(target: AudioUploadTarget): { audioUrl?: string; audioStorageKey?: string } {
  if (target.provider === "r2") return { audioStorageKey: target.key };
  const { data } = supabaseAdmin.storage.from("audio-tracks").getPublicUrl(target.key);
  return { audioUrl: data.publicUrl };
}

// Downloads an external image (a YouTube thumbnail, a Telegram document
// thumb, a channel/playlist cover) and re-uploads it into Supabase Storage —
// so neither a track's, album's, nor artist's image ever ends up pointing at
// a raw external CDN URL that could expire or disappear.
export async function importImageFromUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const contentType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const buffer = Buffer.from(await res.arrayBuffer());
    return await uploadImageToStorage(buffer, contentType);
  } catch {
    return undefined;
  }
}

// Reuses an existing catalog artist with a case-insensitive matching name, or
// creates one. When neither the existing row nor a new one has a photo yet,
// fetchPhotoUrl (if given) is called as a best-effort fallback — passed in
// by the caller rather than fetched here, since how to find a source's
// "artist photo" (a YouTube channel avatar, nothing yet for Telegram) is
// entirely source-specific. Only ever called once per artist in practice,
// since after the first track's import sets photoUrl, later tracks from the
// same source see existing.photoUrl already set and skip the lookup.
export async function findOrCreateArtist(name: string, fetchPhotoUrl?: (() => Promise<string | undefined>) | null) {
  const existing = await prisma.artist.findFirst({
    where: { ownerId: null, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.photoUrl || !fetchPhotoUrl) return existing;
    const photoUrl = await fetchPhotoUrl();
    if (!photoUrl) return existing;
    return prisma.artist.update({ where: { id: existing.id }, data: { photoUrl } });
  }

  const photoUrl = fetchPhotoUrl ? await fetchPhotoUrl() : undefined;
  const [gradientFrom, gradientTo] = gradientForSeed(name);
  return prisma.artist.create({ data: { name, gradientFrom, gradientTo, photoUrl } });
}

// A Single import never *automatically* creates an artist — this only ever
// looks for a case-insensitive name match among existing catalog artists,
// returning null rather than creating one when there's no match. A Single
// that matches links to that existing artist exactly like any other track
// would; one that doesn't stays unassigned (Track.artistId null,
// Track.artistNameOverride holds the name).
export async function findExistingArtist(name: string) {
  return prisma.artist.findFirst({
    where: { ownerId: null, name: { equals: name, mode: "insensitive" } },
  });
}

// Batch-scoped cache of "normalized album title -> id of the new duplicate
// album created for it during this batch run", so all of one re-imported
// album's tracks land together in one freshly-created duplicate album,
// rather than each track spawning its own separate one-track album. The
// underlying storage (YoutubeImportBatch.duplicateAlbumMap vs
// TelegramImportBatch.duplicateAlbumMap) is a different Prisma model per
// source, so the caller supplies plain read/write accessors instead of a
// batchId — that's what keeps findOrCreateAlbum itself source-agnostic.
export interface DuplicateAlbumMapAccessor {
  get: () => Promise<Record<string, string> | null>;
  set: (map: Record<string, string>) => Promise<void>;
}

// Reuses an existing album (matched by title, under the same artist) or
// creates one — this is what turns a catalog import's album/release grouping
// into a real Album row rather than just a string label. Re-running an
// import against the same source finds the existing album and adds only the
// tracks it's missing, rather than creating a duplicate Album each time.
// Catalog imports never fetch or assign any artwork here — a created album
// always starts coverUrl-less; the manual Album Artwork Editor is the only
// way to set one afterward.
export async function findOrCreateAlbum(
  artistId: string,
  title: string,
  options?: { allowDuplicates?: boolean; albumType?: AlbumType; duplicateAlbumMap?: DuplicateAlbumMapAccessor }
) {
  const artist = await prisma.artist.findUniqueOrThrow({ where: { id: artistId } });

  // Allow-duplicates path: never reuse an existing album by match — but
  // still only create ONE new duplicate album per distinct title per batch
  // (not one per track), via the caller-supplied map accessor. Safe without
  // locking because both catalog workers (youtube and telegram) only ever
  // process one item at a time, globally, per process.
  if (options?.allowDuplicates && options?.duplicateAlbumMap) {
    const normalized = normalizeForMatch(title);
    const map = (await options.duplicateAlbumMap.get()) ?? {};
    if (map[normalized]) {
      return prisma.album.findUniqueOrThrow({ where: { id: map[normalized] } });
    }
    const created = await prisma.album.create({
      data: {
        title,
        artistId,
        gradientFrom: artist.gradientFrom,
        gradientTo: artist.gradientTo,
        albumType: options.albumType,
      },
    });
    await options.duplicateAlbumMap.set({ ...map, [normalized]: created.id });
    return created;
  }

  const exact = await prisma.album.findFirst({ where: { artistId, title: { equals: title, mode: "insensitive" } } });
  if (exact) return exact;

  // No exact match — fall back to fuzzy title matching (same bar as the
  // rest of the app) so minor punctuation/spacing differences between two
  // enumeration passes don't spawn a duplicate album.
  const candidates = await prisma.album.findMany({ where: { artistId }, select: { id: true, title: true } });
  const best = candidates
    .map((c) => ({ id: c.id, score: similarity(c.title, title) }))
    .sort((a, b) => b.score - a.score)[0];
  if (best && best.score >= IDENTITY_MIN) {
    // A match against an existing album keeps whatever type it already
    // had — choosing a different destination type for this batch can never
    // silently retag an existing album that just happens to share this title.
    return prisma.album.findUniqueOrThrow({ where: { id: best.id } });
  }

  return prisma.album.create({
    data: {
      title,
      artistId,
      gradientFrom: artist.gradientFrom,
      gradientTo: artist.gradientTo,
      albumType: options?.albumType,
    },
  });
}

// Resolves a batch's target artist up front — required, never guessed.
// "existing" must reference a real catalog artist; "new" hard-blocks on a
// normalized-name match against any existing catalog artist (case-
// insensitive, punctuation/diacritic-insensitive) rather than silently
// creating a likely duplicate — the admin must either pick the existing
// artist or choose a genuinely different name. Returns null (after writing
// the response itself) on any validation failure, so callers just return.
export async function resolveTargetArtist(
  res: Response,
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
