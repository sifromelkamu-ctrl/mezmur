import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENGLISH_VERSION_LABELS,
  ENGLISH_VERSION_OPTIONS,
  type BibleLanguage,
  type EnglishVersion,
} from "../../utils/bibleReadingPrefs";

type BookText = Record<string, string[]>;
type VersionId = EnglishVersion | "am";

// Small local fetch-or-null — deliberately not shared with the main reader's
// own book-loading effect, so this modal has no dependency on anything else
// mid-refactor elsewhere in the Bible section.
async function fetchBookOrNull(path: string): Promise<BookText | null> {
  try {
    const res = await fetch(path);
    return res.ok ? ((await res.json()) as BookText) : null;
  } catch {
    return null;
  }
}

const VERSION_ORDER: VersionId[] = ["am", ...ENGLISH_VERSION_OPTIONS];
const VERSION_LABELS: Record<VersionId, string> = { am: "አማርኛ", ...ENGLISH_VERSION_LABELS };
const VERSION_SHORT_LABELS: Record<VersionId, string> = { am: "አማ", kjv: "KJV", asv: "ASV", web: "WEB", ylt: "YLT" };

interface BibleCompareModalProps {
  bookSlug: string;
  chapter: number;
  verseIndices: number[];
  reference: string;
  language: BibleLanguage;
  englishVersion: EnglishVersion;
  onClose: () => void;
}

function VersionPicker({
  side,
  value,
  onChange,
}: {
  side: string;
  value: VersionId;
  onChange: (v: VersionId) => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-10 shrink-0 text-[10px] font-bold text-fg-muted uppercase tracking-wide">{side}</span>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {VERSION_ORDER.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              value === v
                ? "bg-[var(--color-gold)] text-black border-transparent"
                : "border-border text-fg-muted hover:text-fg hover:border-fg-subtle"
            }`}
          >
            {VERSION_SHORT_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Every version this reader has data for (Amharic + the four public-domain
// English translations — see bibleReadingPrefs.ts's own note on why no
// modern/copyrighted translation like NIV is bundled) fetched once for the
// *whole* chapter, then shown two at a time in a split-screen layout — pick
// any version per side, each side scrolling independently — with the
// verse(s) the reader originally selected picked out so they stay oriented
// while reading the chapter around them for context.
export default function BibleCompareModal({
  bookSlug,
  chapter,
  verseIndices,
  reference,
  language,
  englishVersion,
  onClose,
}: BibleCompareModalProps) {
  const [chapters, setChapters] = useState<Record<VersionId, string[] | null> | null>(null);
  const currentVersion: VersionId = language === "am" ? "am" : englishVersion;
  const [leftVersion, setLeftVersion] = useState<VersionId>(currentVersion);
  const [rightVersion, setRightVersion] = useState<VersionId>(currentVersion === "am" ? "kjv" : "am");
  const selectedVerseSet = new Set(verseIndices);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const targets = VERSION_ORDER.map((id) => ({
        id,
        path: id === "am" ? `/bible/${bookSlug}.json` : `/bible/en/${id}/${bookSlug}.json`,
      }));
      const settled = await Promise.all(
        targets.map(async (t) => {
          const data = await fetchBookOrNull(t.path);
          return [t.id, data?.[chapter] ?? null] as const;
        })
      );
      if (!cancelled) setChapters(Object.fromEntries(settled) as Record<VersionId, string[] | null>);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [bookSlug, chapter]);

  return createPortal(
    <div
      className="bible-scope fixed inset-0 z-50 bg-elevated flex flex-col"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}
    >
      <div className="px-5 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-agbalumo text-xl font-bold text-gold">Compare</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-fg-muted mb-3 truncate">{reference}</p>
        <div className="flex flex-col gap-2 mb-3">
          <VersionPicker side="Left" value={leftVersion} onChange={setLeftVersion} />
          <VersionPicker side="Right" value={rightVersion} onChange={setRightVersion} />
        </div>
      </div>

      {chapters === null ? (
        <div className="flex-1 flex items-center justify-center text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 flex gap-2 px-5 pb-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          {[leftVersion, rightVersion].map((id, i) => {
            const verses = chapters[id];
            return (
              <div
                key={`${id}-${i}`}
                className="flex-1 min-w-0 flex flex-col rounded-2xl bg-elevated-hover/60 ring-1 ring-border overflow-hidden"
              >
                <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-gold px-3 pt-3 pb-1.5">
                  {VERSION_LABELS[id]}
                </p>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
                  {verses ? (
                    verses.map((verse, vi) => {
                      if (!verse) return null;
                      const isSelected = selectedVerseSet.has(vi);
                      return (
                        <p
                          key={vi}
                          className={`text-[0.9rem] leading-relaxed text-fg mb-2 ${
                            isSelected ? "bg-gold/10 rounded-lg px-1.5 -mx-1.5 py-0.5" : ""
                          }`}
                        >
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/15 text-gold text-[9px] font-bold mr-1.5 align-middle">
                            {vi + 1}
                          </span>
                          {verse}
                        </p>
                      );
                    })
                  ) : (
                    <span className="text-fg-subtle italic text-[0.9rem]">Not available for this book.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
