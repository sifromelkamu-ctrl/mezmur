import { randomUUID } from "node:crypto";
import multer from "multer";
import { supabaseAdmin } from "./supabase.js";

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

// Uploads an in-memory buffer straight to a Supabase Storage bucket and
// returns its public URL. This is the cloud-storage integration point for
// every image upload in the app (artist photos, album/playlist covers).
export async function uploadImageToStorage(buffer: Buffer, mimetype: string): Promise<string> {
  const path = `${randomUUID()}${extFromMime(mimetype)}`;
  const { error } = await supabaseAdmin.storage
    .from("album-art")
    .upload(path, buffer, { contentType: mimetype, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("album-art").getPublicUrl(path);
  return data.publicUrl;
}
