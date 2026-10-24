import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { supabaseAdmin } from "./supabase.js";
import { r2Configured, uploadArtwork } from "./storage/r2.js";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Images are small enough to safely buffer in memory for the length of a
// single request, then hand straight to Supabase Storage — no local disk
// involved at any point.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

// The client never resizes before uploading — a phone-camera photo or a
// straight-off-Figma PNG export routinely lands north of 2-5MB, and that
// exact buffer is what every viewer's list/grid tile (rendered at maybe
// 48-150px) ends up downloading in full every time, since none of these are
// ever re-fetched at a smaller size after upload. 1600px covers the largest
// on-screen use (CoverArt's full-bleed "albumHero") at a high device pixel
// ratio with headroom to spare.
const MAX_IMAGE_DIMENSION = 1600;

// A second, much smaller derivative for every other on-screen use (row
// thumbnails, grid cards, the mini player) — those only ever render in the
// 48-180px range even at a high device pixel ratio, so the full 1600px
// image was pure wasted bandwidth there. 480px covers all of those with
// headroom. Stored under a predictable "-thumb" suffix on the SAME key
// (see CoverArt.tsx's toThumbUrl) rather than as a second URL threaded
// through every entity/DTO/admin form that passes a single
// photoUrl/coverUrl around — the client derives it from the URL it
// already has.
const THUMB_MAX_DIMENSION = 480;

interface ProcessedImage {
  buffer: Buffer;
  mimetype: string;
}

async function resizeVariant(
  buffer: Buffer,
  mimetype: string,
  hasAlpha: boolean,
  maxDimension: number,
  quality: number
): Promise<ProcessedImage> {
  const resized = sharp(buffer)
    .rotate() // apply EXIF orientation before resizing, then drop it — a raw phone photo would otherwise render sideways once the tag is stripped downstream
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });

  // Most uploaded PNGs are opaque photos/screenshots saved as PNG rather
  // than anything that actually needs lossless/alpha — measured against a
  // real 1254x1254 opaque album cover, PNG-with-palette-quantization still
  // came out around 900KB while JPEG at quality 82 was ~200KB, same pixels.
  // Only a genuine alpha channel is worth keeping a lossless format for.
  if (hasAlpha && (mimetype === "image/png" || mimetype === "image/webp")) {
    if (mimetype === "image/webp") {
      return { buffer: await resized.webp({ quality }).toBuffer(), mimetype };
    }
    return { buffer: await resized.png({ compressionLevel: 9, palette: true }).toBuffer(), mimetype };
  }
  return { buffer: await resized.jpeg({ quality, mozjpeg: true }).toBuffer(), mimetype: "image/jpeg" };
}

// Exported so the one-off backfill script (scripts/backfillArtworkThumbs.mts)
// can generate the exact same thumb derivative for already-uploaded artwork
// that predates this feature, instead of a second, drifting copy of this
// logic living in two places.
export async function generateThumbnail(buffer: Buffer, mimetype: string): Promise<ProcessedImage> {
  if (mimetype === "image/gif") return { buffer, mimetype };
  const { hasAlpha } = await sharp(buffer).metadata();
  return resizeVariant(buffer, mimetype, Boolean(hasAlpha), THUMB_MAX_DIMENSION, 75);
}

async function processImage(buffer: Buffer, mimetype: string): Promise<{ main: ProcessedImage; thumb: ProcessedImage }> {
  // GIFs are rare here and often animated — sharp's default pipeline only
  // keeps the first frame, which would silently kill that animation, so
  // these pass through untouched rather than risk it (both "variants" are
  // just the original).
  if (mimetype === "image/gif") {
    const passthrough = { buffer, mimetype };
    return { main: passthrough, thumb: passthrough };
  }

  const { hasAlpha } = await sharp(buffer).metadata();
  const [main, thumb] = await Promise.all([
    resizeVariant(buffer, mimetype, Boolean(hasAlpha), MAX_IMAGE_DIMENSION, 82),
    resizeVariant(buffer, mimetype, Boolean(hasAlpha), THUMB_MAX_DIMENSION, 75),
  ]);
  return { main, thumb };
}

function extFromMime(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[mimetype] ?? ".jpg";
}

// Uploads an in-memory buffer and returns its public URL. This is the
// cloud-storage integration point for every image upload in the app (artist
// photos, album/playlist covers, Contact Us attachments) — `bucket` defaults
// to the original "album-art" so every existing caller is unaffected by
// signature. Goes to Cloudflare R2's public artwork bucket once R2_* env
// vars are set (see storage/r2.ts); until then, falls back to Supabase
// Storage exactly as before — this function's behavior only changes the
// moment R2 is actually configured, never as a side effect of deploying
// this code. `bucket` becomes an R2 key prefix in the new path rather than
// a literal Supabase bucket name, purely for keeping different upload
// sources visually separated in the R2 dashboard.
export async function uploadImageToStorage(buffer: Buffer, mimetype: string, bucket = "album-art"): Promise<string> {
  // Never let a resize hiccup (corrupt upload, an exotic ICC profile, etc.)
  // block the upload itself — worst case it stores the original, oversized
  // buffer exactly as before this existed, under its original mimetype, as
  // both "variants".
  const { main, thumb } = await processImage(buffer, mimetype).catch(() => ({
    main: { buffer, mimetype },
    thumb: { buffer, mimetype },
  }));
  const ext = extFromMime(main.mimetype);
  const id = randomUUID();

  if (r2Configured) {
    const key = `artwork/${bucket}/${id}${ext}`;
    const thumbKey = `artwork/${bucket}/${id}-thumb${ext}`;
    const [url] = await Promise.all([
      uploadArtwork(main.buffer, main.mimetype, key),
      // Best-effort — a failed thumb upload should never fail the upload
      // the user is waiting on; the client falls back to the full-size
      // image for any URL whose thumb 404s (see CoverArt.tsx).
      uploadArtwork(thumb.buffer, thumb.mimetype, thumbKey).catch((err) =>
        console.warn("[upload] thumb upload failed, full-size artwork still served fine:", err)
      ),
    ]);
    return url;
  }

  const path = `${id}${ext}`;
  const thumbPath = `${id}-thumb${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, main.buffer, { contentType: main.mimetype, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  supabaseAdmin.storage
    .from(bucket)
    .upload(thumbPath, thumb.buffer, { contentType: thumb.mimetype, upsert: false })
    .then(({ error: thumbError }) => {
      if (thumbError) console.warn("[upload] thumb upload failed (Supabase path):", thumbError.message);
    });

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
