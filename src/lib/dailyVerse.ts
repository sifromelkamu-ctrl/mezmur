import { BIBLE_BOOKS } from "../data/bibleBooks";
import { MORNING_VERSES } from "../data/morningVerses";
import { loadReadingPrefs } from "../utils/bibleReadingPrefs";

export interface DailyVerse {
  ref: string;
  text: string;
  slug: string;
  chapter: number;
  verseIndex: number;
}

type BookText = Record<string, (string | null)[]>;

// Same well-mixed 32-bit hash Bible.tsx's own hero-card pick uses (and that
// server/src/push.ts mirrors for the per-user push pick) — kept as its own
// small copy here rather than shared, since this needs to run standalone
// from Home's notification panel without mounting Bible.tsx at all.
function mix32(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

// One pick per local calendar day, same as Bible.tsx's hero card — so the
// notification panel's verse always matches whatever's shown there.
function dailyVerseIndexFor(date: Date): number {
  const dayNumber = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  return mix32(dayNumber) % MORNING_VERSES.length;
}

// Generous enough for a notification card (not clamped to a 3-line hero
// card like Bible.tsx's own use of this same list).
const MAX_VERSE_CHARS = 180;

export async function getDailyVerse(): Promise<DailyVerse | null> {
  const prefs = loadReadingPrefs();
  const startIndex = dailyVerseIndexFor(new Date());
  const bookCache = new Map<string, BookText | null>();

  async function fetchBook(slug: string): Promise<BookText | null> {
    if (bookCache.has(slug)) return bookCache.get(slug)!;
    const path = prefs.language === "en" ? `/bible/en/${prefs.englishVersion}/${slug}.json` : `/bible/${slug}.json`;
    const data = await fetch(path)
      .then((res) => (res.ok ? (res.json() as Promise<BookText>) : null))
      .catch(() => null);
    bookCache.set(slug, data);
    return data;
  }

  // Walks forward through the curated list until one both exists in the
  // fetched book and fits — same fallback approach as Bible.tsx's hero card.
  for (let attempt = 0; attempt < 8; attempt++) {
    const pick = MORNING_VERSES[(startIndex + attempt) % MORNING_VERSES.length];
    const data = await fetchBook(pick.slug);
    const text = data?.[String(pick.chapter)]?.[pick.verseIndex];
    if (!text || text.length > MAX_VERSE_CHARS) continue;
    const book = BIBLE_BOOKS.find((b) => b.slug === pick.slug);
    const ref = prefs.language === "en" && book ? `${book.name} ${pick.chapter}:${pick.verseIndex + 1}` : pick.refAm;
    return { ref, text, slug: pick.slug, chapter: pick.chapter, verseIndex: pick.verseIndex };
  }
  return null;
}
