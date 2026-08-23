const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
// Public R2 media domain/URL, once configured (see server's R2_MEDIA_DOMAIN/
// R2_PUBLIC_URL — this is the client-side counterpart, safe to expose since
// it's a public bucket with nothing sensitive behind it). Undefined until
// then, in which case bibleAudioUrl keeps building the old Supabase URL —
// this file only ever changes behavior once this env var is actually set.
const R2_MEDIA_BASE = (import.meta.env.VITE_R2_MEDIA_DOMAIN as string | undefined)?.replace(/\/+$/, "");

// Amharic chapter-by-chapter recordings, uploaded as "bible-audio/<bookSlug>/
// <chapter>.mp3" to whichever public bucket is currently in use (see
// server/scripts/uploadBibleAudio.mts) — public and read-only either way, so
// the URL is just a deterministic path, no auth or server round-trip needed.
// Bible audio was never subscription-gated content, so — unlike track
// audio — it belongs in R2's *public* bucket, not the private one behind
// signed playback URLs (see Track.audioStorageKey's doc comment in
// schema.prisma for why those two need different treatment).
export function bibleAudioUrl(bookSlug: string, chapter: number): string {
  if (R2_MEDIA_BASE) return `${R2_MEDIA_BASE}/bible-audio/${bookSlug}/${chapter}.mp3`;
  return `${SUPABASE_URL}/storage/v1/object/public/bible-audio/${bookSlug}/${chapter}.mp3`;
}
