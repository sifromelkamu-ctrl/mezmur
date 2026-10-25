import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";
import BibleModalShell from "./BibleModalShell";

export interface HistoryEntry {
  key: string;
  bookSlug: string;
  chapter: number;
  readAt: number;
}

interface BibleHistoryModalProps {
  entries: HistoryEntry[];
  language: BibleLanguage;
  englishVersion: EnglishVersion;
  onOpenVerse: (bookSlug: string, chapter: number, verseIndex: number) => void;
  onClose: () => void;
}

// Real elapsed time since readAt (recordChapterRead's own timestamp,
// bibleReadingHistory.ts) — "Just now"/"2h ago"/"Yesterday"/a real date
// once it's far enough back, not a vague "recently".
function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;
  if (diff < MIN) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A reading timeline for history, replacing the plain citation-list
// BibleListModal — each entry shows the real verse 1 of that chapter as a
// preview (fetched on open, see bibleVerseLookup.ts), how long ago it was
// actually opened (recordChapterRead's own timestamp), and real progress
// through the book (chapter / that book's total chapter count) as a thin
// bar, instead of a bare "Genesis 3" row with no sense of when or how far
// along. The shell's own header/empty-state chrome uses blue throughout,
// matching this action's color on the Quick Access row itself.
export default function BibleHistoryModal({ entries, language, englishVersion, onOpenVerse, onClose }: BibleHistoryModalProps) {
  const [verseTexts, setVerseTexts] = useState<Record<string, string | null>>({});
  const cacheRef = useRef<Map<string, Record<string, string[]> | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const entry of entries) {
        const text = await fetchVerseText(entry.bookSlug, entry.chapter, 0, language, englishVersion, cacheRef.current);
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
      icon={Clock}
      title="History"
      count={entries.length}
      countLabel={{ singular: "chapter", plural: "chapters" }}
      accent="var(--bible-blue)"
      accentSoft="var(--bible-blue-soft)"
      emptyIcon={Clock}
      emptyLabel="እስካሁን ምንም አልተነበበም።"
      onClose={onClose}
    >
      {entries.map((entry) => {
        const book = BIBLE_BOOKS.find((b) => b.slug === entry.bookSlug);
        const citation = `${book?.nameAm ?? entry.bookSlug} ${entry.chapter}`;
        const verseText = verseTexts[entry.key];
        const percent = book ? Math.round((entry.chapter / book.chapterCount) * 100) : 0;
        const accent = "var(--bible-blue)";
        return (
          <button
            key={entry.key}
            onClick={() => onOpenVerse(entry.bookSlug, entry.chapter, 0)}
            className="relative w-full text-left rounded-2xl p-4 overflow-hidden shadow-[0_10px_28px_-18px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.05] active:scale-[0.98] transition-transform"
            style={{ background: "var(--color-elevated)" }}
          >
            <div className="relative flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>
                {citation}
              </span>
              <span className="text-[10px] font-semibold text-fg-subtle shrink-0">{formatRelativeTime(entry.readAt)}</span>
            </div>

            <p className="relative font-abyssinica italic text-[0.9rem] leading-snug text-fg mb-2 line-clamp-2">
              {verseText ? `“${verseText}”` : "..."}
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--bible-blue) 18%, transparent)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: accent }} />
              </div>
              <span className="text-[9px] font-semibold text-fg-subtle shrink-0">{percent}%</span>
            </div>
          </button>
        );
      })}
    </BibleModalShell>
  );
}
