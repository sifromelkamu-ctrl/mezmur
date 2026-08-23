import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

// Cloudflare R2 speaks the S3 API, so the official AWS SDK works against it
// unmodified — just point `endpoint` at the account's R2 endpoint instead of
// AWS's. This is the ONE place in the app that talks to R2 directly; every
// route/pipeline goes through the functions below rather than constructing
// its own S3Client, so a future storage-provider change (or a fix to how
// keys/URLs are built) only ever needs to happen here.
//
// Two buckets, not one, for a real reason: artwork wants a permanent public
// URL (same UX Supabase's getPublicUrl already gives every image in the
// app), while audio must never have a permanent public URL at all — only
// short-lived signed links minted per authorized playback request (see
// routes/tracks.ts's /:id/play). R2's access control is per-bucket, not
// per-object-prefix, so getting both of those right means two buckets: one
// public (artwork), one private (audio). See the migration plan for the
// exact Cloudflare dashboard steps to create each.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID?.trim();
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY?.trim();
// Public bucket — artwork (album/artist/playlist covers, banners, contact
// attachments, submission images).
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME?.trim();
// Private bucket — audio masters. Never given a public URL.
const R2_AUDIO_BUCKET_NAME = process.env.R2_AUDIO_BUCKET_NAME?.trim();
// The artwork bucket's public base URL — either R2's free *.r2.dev subdomain
// (works immediately, no domain needed) or a custom domain once one's
// connected (see R2_MEDIA_DOMAIN below, which — once set — takes priority).
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.trim();
// Optional: a custom domain (e.g. media.mezmur.com) connected to the public
// bucket in Cloudflare. When set, this is used instead of R2_PUBLIC_URL for
// every newly-built artwork URL — existing rows already have a full URL
// baked in either way, so switching this later only affects new uploads,
// never breaks anything already saved.
const R2_MEDIA_DOMAIN = process.env.R2_MEDIA_DOMAIN?.trim();

export const r2Configured = Boolean(
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_AUDIO_BUCKET_NAME
);

if (!r2Configured) {
  console.log(
    "[r2] not fully configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_AUDIO_BUCKET_NAME) — every new upload still goes to Supabase Storage until this is set."
  );
}

const client = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
  : null;

function requireClient(): S3Client {
  if (!client) throw new Error("R2 is not configured — see r2Configured / the required R2_* env vars in storage/r2.ts");
  return client;
}

export type MediaKind = "track_audio" | "track_cover" | "album_cover" | "artist_photo" | "playlist_cover";

// Deterministic, collision-proof key layout per the migration plan — stable
// IDs rather than raw filenames, so two different uploads never collide and
// a key alone tells you exactly what it is without a DB lookup.
export function buildObjectKey(kind: MediaKind, entityId: string, ext: string): string {
  const cleanExt = ext.startsWith(".") ? ext : `.${ext}`;
  switch (kind) {
    case "track_audio":
      return `audio/tracks/${entityId}${cleanExt}`;
    case "track_cover":
      return `artwork/tracks/${entityId}${cleanExt}`;
    case "album_cover":
      return `artwork/albums/${entityId}${cleanExt}`;
    case "artist_photo":
      return `artwork/artists/${entityId}${cleanExt}`;
    case "playlist_cover":
      return `artwork/playlists/${entityId}${cleanExt}`;
  }
}

// Same one-off-upload naming used by images today (a random id, not tied to
// any entity) — for uploads that don't yet have an owning row (Contact Us
// attachments, a pending song submission's artwork before it's approved
// into a real Artist/Album).
export function buildLooseImageKey(ext: string): string {
  const cleanExt = ext.startsWith(".") ? ext : `.${ext}`;
  return `artwork/uploads/${randomUUID()}${cleanExt}`;
}

function publicBaseUrl(): string {
  const base = R2_MEDIA_DOMAIN || R2_PUBLIC_URL;
  if (!base) throw new Error("R2_PUBLIC_URL or R2_MEDIA_DOMAIN must be set to build a public artwork URL");
  return base.replace(/\/+$/, "");
}

// The permanent public URL for an object in the *artwork* (public) bucket —
// never call this for anything in the audio bucket, which has no public URL
// by design.
export function publicArtworkUrl(key: string): string {
  return `${publicBaseUrl()}/${key}`;
}

// Uploads a small in-memory buffer (images) to the public artwork bucket.
// Mirrors upload.ts's old uploadImageToStorage, just against R2 instead of
// Supabase — every existing caller of that function gets this transparently.
export async function uploadArtwork(buffer: Buffer, contentType: string, key: string): Promise<string> {
  await requireClient().send(
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType })
  );
  return publicArtworkUrl(key);
}

// Mints a presigned PUT URL for the private *audio* bucket — the browser (or
// server pipeline) uploads bytes straight to R2 with this, the same
// "bypass our own server for the large file" pattern the app already used
// for Supabase's createSignedUploadUrl. expiresInSeconds is deliberately
// short (this is only ever used within seconds of being minted, right
// before the caller starts the actual upload).
export async function createAudioUploadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_AUDIO_BUCKET_NAME, Key: key, ContentType: "audio/mpeg" });
  return getSignedUrl(requireClient(), command, { expiresIn: expiresInSeconds });
}

// Mints a presigned GET URL for the private audio bucket — the ONLY way
// audio in R2 is ever actually reachable. Called fresh on every authorized
// playback request (routes/tracks.ts), never cached/stored — see
// Track.audioStorageKey's doc comment in schema.prisma for the full
// reasoning. A few hours is generous for one listening session without
// leaving a link that's still good days later if it leaks.
export async function createAudioPlaybackUrl(key: string, expiresInSeconds = 6 * 60 * 60): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_AUDIO_BUCKET_NAME, Key: key });
  return getSignedUrl(requireClient(), command, { expiresIn: expiresInSeconds });
}

// Uploads an already-downloaded audio file's bytes directly (used by the
// migration worker and any server-side path that has the bytes in hand
// already, as opposed to a client PUTting to a presigned URL itself).
export async function putAudioObject(key: string, body: Buffer, contentType = "audio/mpeg"): Promise<void> {
  await requireClient().send(
    new PutObjectCommand({ Bucket: R2_AUDIO_BUCKET_NAME, Key: key, Body: body, ContentType: contentType })
  );
}

export async function putArtworkObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await requireClient().send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
}

// True streaming transfer — the migration worker's own upload path (see
// storage/migration.ts), deliberately separate from the small in-memory
// put*Object() helpers above (those stay Buffer-based on purpose: every
// caller of those already has a small, already-buffered multer upload in
// hand, e.g. a 5MB image). This one exists specifically so a 50MB audio
// file being copied Supabase -> R2 is never fully materialized in this
// process's memory at once: `body` is the live HTTP response stream from
// the Supabase fetch, piped straight through to R2. @aws-sdk/lib-storage's
// Upload handles the chunking itself — a simple single PUT for a small
// object, a real multipart upload for a large one — so this same call
// works correctly across the whole size range without the caller having to
// decide which.
export async function streamToBucket(
  bucket: "audio" | "artwork",
  key: string,
  body: Readable,
  contentType: string
): Promise<void> {
  const upload = new Upload({
    client: requireClient(),
    params: { Bucket: bucket === "audio" ? R2_AUDIO_BUCKET_NAME : R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType },
    // Conservative part size (S3/R2 minimum is 5MB) — keeps peak memory for
    // one in-flight upload low and predictable rather than defaulting to
    // whatever the SDK's own default queue/part-size tuning picks.
    partSize: 8 * 1024 * 1024,
    queueSize: 1,
  });
  await upload.done();
}

export interface ObjectInfo {
  sizeBytes: number;
  etag: string | undefined;
}

// HEAD request — used by the migration worker to verify an upload actually
// landed (right size) without downloading the whole object again.
export async function headObject(bucket: "audio" | "artwork", key: string): Promise<ObjectInfo | null> {
  try {
    const res = await requireClient().send(
      new HeadObjectCommand({ Bucket: bucket === "audio" ? R2_AUDIO_BUCKET_NAME : R2_BUCKET_NAME, Key: key })
    );
    return { sizeBytes: res.ContentLength ?? 0, etag: res.ETag };
  } catch {
    return null;
  }
}

// Lists every object key under a prefix in the public bucket (paginated
// automatically) — used by one-off scripts like uploadBibleAudio.mts to
// figure out what's already uploaded before re-running, the R2 equivalent
// of Supabase Storage's .list().
export async function listPublicObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await requireClient().send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function deleteObject(bucket: "audio" | "artwork", key: string): Promise<void> {
  await requireClient().send(
    new DeleteObjectCommand({ Bucket: bucket === "audio" ? R2_AUDIO_BUCKET_NAME : R2_BUCKET_NAME, Key: key })
  );
}

// Server-side copy within the same bucket (e.g. re-keying) — not used by the
// Supabase migration itself (that's a cross-provider copy, which R2/S3
// CopyObject can't do; the migration worker downloads from Supabase and
// uploads to R2 as two separate steps instead), kept here as a reusable
// primitive since the centralized-service brief asked for one.
export async function copyObject(bucket: "audio" | "artwork", sourceKey: string, destinationKey: string): Promise<void> {
  const bucketName = bucket === "audio" ? R2_AUDIO_BUCKET_NAME : R2_BUCKET_NAME;
  await requireClient().send(
    new CopyObjectCommand({ Bucket: bucketName, CopySource: `${bucketName}/${sourceKey}`, Key: destinationKey })
  );
}
