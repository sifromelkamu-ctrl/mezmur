import { randomUUID } from "node:crypto";
import multer from "multer";
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
  const ext = extFromMime(mimetype);

  if (r2Configured) {
    const key = `artwork/${bucket}/${randomUUID()}${ext}`;
    return uploadArtwork(buffer, mimetype, key);
  }

  const path = `${randomUUID()}${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimetype, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
