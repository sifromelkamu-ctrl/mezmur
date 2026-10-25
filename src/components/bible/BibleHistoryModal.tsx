import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BIBLE_BOOKS } from "../../data/bibleBooks";
import type { BibleLanguage, EnglishVersion } from "../../utils/bibleReadingPrefs";
import { fetchVerseText } from "../../utils/bibleVerseLookup";

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
// along.
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

  return createPortal(
    <div
      className="bible-scope fixed inset-0 z-50 bg-elevated overflow-y-auto overscroll-y-contain"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
    >
      <div className="max-w-2xl mx-auto px-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-agbalumo text-2xl font-bold text-gold leading-none">History</h2>
            <p className="text-xs text-fg-muted mt-1">
              {entries.length} {entries.length === 1 ? "chapter" : "chapters"}
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
          <p className="text-sm text-fg-muted py-16 text-center">እስካሁን ምንም አልተነበበም።</p>
        ) : (
          <div className="space-y-3">
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
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
