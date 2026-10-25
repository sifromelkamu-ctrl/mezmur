import { Heart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";

export interface FavoriteEntry {
  key: string;
  bookSlug: string;
  chapter: number;
  verseIndex: number;
}

interface BibleFavoritesModalProps {
  entries: FavoriteEntry[];
  language: BibleLanguage;
  englishVersion: EnglishVersion;
  onOpenVerse: (bookSlug: string, chapter: number, verseIndex: number) => void;
  onClose: () => void;
}

// A keepsake "quote collection" for loved verses, replacing the plain
// citation-list BibleListModal — each favorite shows its real verse text
// (fetched on open, see bibleVerseLookup.ts) as the card's own focal
// quote rather than a bare "Psalms 23:1" row with nothing to actually
// read. Each card tinted purple or green by testament (same accent the
// Bible home screen's own OT/NT cards use), so the collection itself
// visually separates into its two halves while scrolling.
export default function BibleFavoritesModal({ entries, language, englishVersion, onOpenVerse, onClose }: BibleFavoritesModalProps) {
  const [verseTexts, setVerseTexts] = useState<Record<string, string | null>>({});
  const cacheRef = useRef<Map<string, Record<string, string[]> | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const entry of entries) {
        const text = await fetchVerseText(entry.bookSlug, entry.chapter, entry.verseIndex, language, englishVersion, cacheRef.current);
        if (cancelled) return;
        setVerseTexts((prev) => (entry.key in prev ? prev : { ...prev, [entry.key]: text }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, language, englishVersion]);

  return createPortal(
    <div
      className="bible-scope fixed inset-0 z-50 bg-elevated overflow-y-auto overscroll-y-contain"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
    >
      <div className="max-w-2xl mx-auto px-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-agbalumo text-2xl font-bold text-gold leading-none">Favorites</h2>
            <p className="text-xs text-fg-muted mt-1">
              {entries.length} {entries.length === 1 ? "verse" : "verses"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-fg-muted py-16 text-center">እስካሁን ምንም የተወደደ ጥቅስ የለም።</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const book = BIBLE_BOOKS.find((b) => b.slug === entry.bookSlug);
              const citation = `${book?.nameAm ?? entry.bookSlug} ${entry.chapter}:${entry.verseIndex + 1}`;
              const verseText = verseTexts[entry.key];
              const isOld = book?.testament !== "new";
              const accent = isOld ? "#5B3FE0" : "#2F9E6E";
              const soft = isOld ? "#EDE9FB" : "#E3F5EC";
              return (
                <button
                  key={entry.key}
                  onClick={() => onOpenVerse(entry.bookSlug, entry.chapter, entry.verseIndex)}
                  className="relative w-full text-left rounded-2xl p-4 overflow-hidden shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.05] active:scale-[0.98] transition-transform"
                  style={{
                    backgroundImage: `radial-gradient(130% 90% at 100% 0%, color-mix(in oklab, ${accent} 20%, transparent) 0%, transparent 60%), linear-gradient(165deg, ${soft} 0%, var(--color-elevated) 70%)`,
                  }}
                >
                  <div className="relative flex items-start justify-between gap-2 mb-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ color: accent, background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
                    >
                      {citation}
                    </span>
                    <Heart size={15} className="shrink-0 mt-0.5" style={{ color: accent }} fill={accent} />
                  </div>

                  <p
                    className={`relative ${verseText ? "font-abyssinica" : "font-abyssinica italic text-fg-subtle"} text-[1rem] leading-snug text-fg`}
                  >
                    {verseText ? `“${verseText}”` : "..."}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
