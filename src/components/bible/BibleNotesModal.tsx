import { ChevronRight, StickyNote, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";

export interface NoteEntry {
  key: string;
  bookSlug: string;
  chapter: number;
  verseIndex: number;
  note: string;
}

interface BibleNotesModalProps {
  entries: NoteEntry[];
  language: BibleLanguage;
  englishVersion: EnglishVersion;
  onOpenVerse: (bookSlug: string, chapter: number, verseIndex: number) => void;
  onClose: () => void;
}

// A dedicated "journal" view for personal notes, replacing the plain
// citation-list BibleListModal used to show these in. Each note gets its
// own card: the real verse text it was written against (fetched on open,
// same book-JSON path the main reader uses — see bibleVerseLookup.ts) for
// context above the fold, then the note itself as the clear focal point
// below a gold pin accent, rather than a bare "Genesis 3:14 — some text"
// row with no sense of what scripture it's actually attached to.
export default function BibleNotesModal({ entries, language, englishVersion, onOpenVerse, onClose }: BibleNotesModalProps) {
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
            <h2 className="font-agbalumo text-2xl font-bold text-gold leading-none">Notes</h2>
            <p className="text-xs text-fg-muted mt-1">
              {entries.length} {entries.length === 1 ? "note" : "notes"}
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
          <p className="text-sm text-fg-muted py-16 text-center">እስካሁን ምንም ማስታወሻ የለም።</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const book = BIBLE_BOOKS.find((b) => b.slug === entry.bookSlug);
              const citation = `${book?.nameAm ?? entry.bookSlug} ${entry.chapter}:${entry.verseIndex + 1}`;
              const verseText = verseTexts[entry.key];
              return (
                <button
                  key={entry.key}
                  onClick={() => onOpenVerse(entry.bookSlug, entry.chapter, entry.verseIndex)}
                  className="relative w-full text-left rounded-2xl pl-4 pr-3 py-3.5 overflow-hidden shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.05] active:scale-[0.98] transition-transform"
                  style={{ background: "var(--color-elevated)" }}
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "var(--color-gold)" }} />
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 right-2 font-serif select-none pointer-events-none"
                    style={{ fontSize: "3.25rem", color: "color-mix(in oklab, var(--color-gold) 16%, transparent)" }}
                  >
                    "
                  </span>

                  <div className="relative flex items-center gap-2 mb-1.5">
                    <StickyNote size={12} style={{ color: "var(--color-gold-dark)" }} />
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: "var(--color-gold-dark)" }}
                    >
                      {citation}
                    </span>
                  </div>

                  {verseText && (
                    <p className="relative font-abyssinica italic text-xs leading-snug text-fg-subtle mb-2 line-clamp-2">
                      “{verseText}”
                    </p>
                  )}

                  <p className="relative font-abyssinica text-[0.95rem] leading-snug text-fg pr-5">{entry.note}</p>

                  <ChevronRight size={14} className="absolute right-3 bottom-3.5 text-fg-subtle" />
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
