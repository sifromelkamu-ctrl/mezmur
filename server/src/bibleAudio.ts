// Amharic audio Bible — streamed live from Faith Comes By Hearing's Digital
// Bible Platform ("Bible Brain") API using the server's own registered key.
// Audio is never downloaded or stored here: this just proxies a signed
// stream URL request so the API key stays server-side, never exposed to
// the client.

// DBP's own 3-letter USX/OSIS book codes, in the same canonical 66-book
// order as src/data/bibleBooks.ts — kept in sync by hand with that file's
// slug order (index i here ↔ BIBLE_BOOKS[i] there).
const DBP_BOOK_CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
] as const;

const BIBLE_SLUGS = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth", "1-samuel", "2-samuel",
  "1-kings", "2-kings", "1-chronicles", "2-chronicles", "ezra", "nehemiah", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "song-of-solomon", "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james",
  "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation",
] as const;

const SLUG_TO_DBP_CODE = new Map<string, string>(BIBLE_SLUGS.map((slug, i) => [slug, DBP_BOOK_CODES[i]]));

export function dbpBookCodeForSlug(slug: string): string | null {
  return SLUG_TO_DBP_CODE.get(slug) ?? null;
}

const apiKey = process.env.DBP_API_KEY;
const filesetId = process.env.DBP_AUDIO_FILESET_ID ?? "AMH1954A1DA";

export const bibleAudioConfigured = Boolean(apiKey);

export interface AudioStreamResult {
  url: string;
  durationSeconds: number | null;
}

// Returns null if this book/chapter has no audio in the configured fileset,
// or if the request otherwise fails (missing key, invalid chapter, DBP
// outage, etc.) — callers should treat null as "audio unavailable" rather
// than surfacing raw API errors to end users.
export async function getAudioStream(bookSlug: string, chapter: number): Promise<AudioStreamResult | null> {
  if (!apiKey) return null;
  const bookCode = dbpBookCodeForSlug(bookSlug);
  if (!bookCode) return null;

  const url = `https://4.dbt.io/api/bibles/filesets/${filesetId}/${bookCode}/${chapter}?v=4&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { path?: string; duration?: number }[] };
    const entry = body.data?.[0];
    if (!entry?.path) return null;
    return { url: entry.path, durationSeconds: entry.duration ?? null };
  } catch (err) {
    console.error("Digital Bible Platform audio fetch failed:", err);
    return null;
  }
}
