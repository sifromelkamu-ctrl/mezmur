import { ChevronRight, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";
import BibleModalShell from "./BibleModalShell";

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

  return (
    <BibleModalShell
      icon={StickyNote}
      title="Notes"
      count={entries.length}
      countLabel={{ singular: "note", plural: "notes" }}
      accent="var(--color-gold-dark)"
      accentSoft="color-mix(in oklab, var(--color-gold) 18%, transparent)"
      emptyIcon={StickyNote}
      emptyLabel="እስካሁን ምንም ማስታወሻ የለም።"
      onClose={onClose}
    >
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
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-gold-dark)" }}>
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
    </BibleModalShell>
  );
}
