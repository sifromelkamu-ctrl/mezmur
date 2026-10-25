import type { BibleLanguage, EnglishVersion } from "./bibleReadingPrefs";

type BookText = Record<string, string[]>;

async function fetchBook(
  bookSlug: string,
  language: BibleLanguage,
  englishVersion: EnglishVersion,
  cache: Map<string, BookText | null>
): Promise<BookText | null> {
  const cacheKey = language === "en" ? `en:${englishVersion}:${bookSlug}` : `am:${bookSlug}`;
  let book = cache.get(cacheKey);
  if (book === undefined) {
    const path = language === "en" ? `/bible/en/${englishVersion}/${bookSlug}.json` : `/bible/${bookSlug}.json`;
    book = await fetch(path)
      .then((res) => (res.ok ? (res.json() as Promise<BookText>) : null))
      .catch(() => null);
    cache.set(cacheKey, book);
  }
  return book;
}

// Shared by BibleNotesModal/BibleFavoritesModal — both want to show the
// actual scripture text for a list of saved verses, not just their
// citations, which means fetching each distinct book's JSON on demand
// (same per-language/version path the main reader already uses). `cache`
// is owned by the caller (one Map per modal instance, keyed by language+
// version+book) so opening both modals in the same session, or re-opening
// one, doesn't re-fetch a book it's already pulled down.
export async function fetchVerseText(
  bookSlug: string,
  chapter: number,
  verseIndex: number,
  language: BibleLanguage,
  englishVersion: EnglishVersion,
  cache: Map<string, BookText | null>
): Promise<string | null> {
  const book = await fetchBook(bookSlug, language, englishVersion, cache);
  const verses = book?.[chapter];
  return verses?.[verseIndex] ?? null;
}

// Used by BibleAudioContext to fetch the next chapter's full text when a
// chapter finishes and playback auto-advances — same book-JSON path, but
// the whole chapter joined into one string (the same shape toggleListen's
// own verseText already takes), not a single verse.
export async function fetchChapterText(
  bookSlug: string,
  chapter: number,
  language: BibleLanguage,
  englishVersion: EnglishVersion,
  cache: Map<string, BookText | null>
): Promise<string | null> {
  const book = await fetchBook(bookSlug, language, englishVersion, cache);
  const verses = book?.[chapter];
  return verses ? verses.filter(Boolean).join(" ") : null;
}
