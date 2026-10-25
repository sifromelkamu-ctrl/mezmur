import { Bookmark } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { HighlightColor } from "../../utils/bibleAnnotations";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";
import BibleModalShell from "./BibleModalShell";

export interface BookmarkEntry {
  key: string;
  bookSlug: string;
  chapter: number;
  verseIndex: number;
  color: HighlightColor;
}

// Real Tailwind v-400 hex for each HIGHLIGHT_COLORS id — HighlightColor's
// own swatch field is a Tailwind class (bg-yellow-400 etc.) for the picker
// UI, not a usable CSS value for a gradient/tint here, so this is that
// same default palette as literal hex instead.
const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
  pink: "#f472b6",
  purple: "#c084fc",
};

interface BibleBookmarksModalProps {
  entries: BookmarkEntry[];
  language: BibleLanguage;
  englishVersion: EnglishVersion;
  onOpenVerse: (bookSlug: string, chapter: number, verseIndex: number) => void;
  onClose: () => void;
}

// A "highlighted passages" view for bookmarks, replacing the plain
// citation-list BibleListModal. Each card is tinted in the bookmark's own
// actual highlight color (not a flat system color) — a bookmark IS a
// colored highlight, so showing the real color the reader picked is more
// honest than recoloring it to match a generic "bookmarks" brand color —
// with the real verse text (fetched on open, see bibleVerseLookup.ts)
// striped underneath like a literal highlighter mark across the page. The
// shell's own header/empty-state chrome uses purple throughout, matching
// this action's color on the Quick Access row itself.
export default function BibleBookmarksModal({ entries, language, englishVersion, onOpenVerse, onClose }: BibleBookmarksModalProps) {
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
      icon={Bookmark}
      title="Bookmarks"
      count={entries.length}
      countLabel={{ singular: "passage", plural: "passages" }}
      accent="var(--bible-purple)"
      accentSoft="var(--bible-purple-soft)"
      emptyIcon={Bookmark}
      emptyLabel="እስካሁን ምንም ምልክት አልተደረገም።"
      onClose={onClose}
    >
      {entries.map((entry) => {
        const book = BIBLE_BOOKS.find((b) => b.slug === entry.bookSlug);
        const citation = `${book?.nameAm ?? entry.bookSlug} ${entry.chapter}:${entry.verseIndex + 1}`;
        const verseText = verseTexts[entry.key];
        const accent = COLOR_HEX[entry.color];
        return (
          <button
            key={entry.key}
            onClick={() => onOpenVerse(entry.bookSlug, entry.chapter, entry.verseIndex)}
            className="relative w-full text-left rounded-2xl pl-4 pr-3 py-3.5 overflow-hidden shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.05] active:scale-[0.98] transition-transform"
            style={{ background: "var(--color-elevated)" }}
          >
            <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent }} />
            <div className="relative flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>
                {citation}
              </span>
            </div>
            <p
              className="relative font-abyssinica text-[0.95rem] leading-snug text-fg rounded-lg px-1 -mx-1 py-0.5"
              style={{ background: `color-mix(in oklab, ${accent} 16%, transparent)` }}
            >
              {verseText ?? "..."}
            </p>
          </button>
        );
      })}
    </BibleModalShell>
  );
}
