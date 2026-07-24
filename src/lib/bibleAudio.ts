const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Amharic chapter-by-chapter recordings, uploaded to a public Supabase
// Storage bucket named "bible-audio" (see server/scripts/uploadBibleAudio.mts)
// as "<bookSlug>/<chapter>.mp3". The bucket is public and read-only, so the
// URL is just a deterministic path — no auth or server round-trip needed.
export function bibleAudioUrl(bookSlug: string, chapter: number): string {
  return `${SUPABASE_URL}/storage/v1/object/public/bible-audio/${bookSlug}/${chapter}.mp3`;
}
