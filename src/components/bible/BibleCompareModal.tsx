import { ChevronDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  ENGLISH_VERSION_LABELS,
  ENGLISH_VERSION_OPTIONS,
  type BibleLanguage,
  type EnglishVersion,
} from "../../utils/bibleReadingPrefs";

type BookText = Record<string, string[]>;
type VersionId = EnglishVersion | "am";
type FontScale = "sm" | "md" | "lg";

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
const FONT_SCALE_CLASSES: Record<FontScale, string> = { sm: "text-[0.78rem]", md: "text-[0.9rem]", lg: "text-[1.05rem]" };
const MIN_SPLIT = 25;
const MAX_SPLIT = 75;

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
// any version per side, each side scrolling independently, with the
// verse(s) the reader originally selected picked out so they stay oriented
// while reading the chapter around them for context. Text size and the
// left/right split are both reader-adjustable rather than fixed, since a
// narrow column that suits a short English verse can crowd a longer
// Amharic one.
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
  const [fontScale, setFontScale] = useState<FontScale>("md");
  const [splitPercent, setSplitPercent] = useState(50);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedVerseSet = new Set(verseIndices);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

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

  const updateSplitFromClientX = (clientX: number) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, percent)));
  };

  const handleDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateSplitFromClientX(e.clientX);
  };
  const handleDragEnd = () => {
    draggingRef.current = false;
  };

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

        {/* One row owns all three settings (left/right version + text size)
            — tap to expand the full controls, collapsed by default so the
            reading panes below get the space instead of three permanent
            rows of chips. */}
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border hover:bg-hover transition-colors mb-3"
        >
          <span className="flex items-center gap-2 min-w-0 text-[12px] font-bold text-fg">
            <SlidersHorizontal size={13} className="text-gold shrink-0" />
            <span className="truncate">
              {VERSION_SHORT_LABELS[leftVersion]} vs {VERSION_SHORT_LABELS[rightVersion]} · {fontScale.toUpperCase()}
            </span>
          </span>
          <ChevronDown
            size={15}
            className={`shrink-0 text-fg-muted transition-transform ${settingsOpen ? "rotate-180" : ""}`}
          />
        </button>

        {settingsOpen && (
          <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-elevated-hover/60 ring-1 ring-border mb-3">
            <VersionPicker side="Left" value={leftVersion} onChange={setLeftVersion} />
            <VersionPicker side="Right" value={rightVersion} onChange={setRightVersion} />
            <div className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[10px] font-bold text-fg-muted uppercase tracking-wide">Size</span>
              <div className="flex gap-1">
                {(["sm", "md", "lg"] as FontScale[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFontScale(s)}
                    className={`shrink-0 px-3 py-1 rounded-full font-bold border transition-colors ${
                      s === "sm" ? "text-[10px]" : s === "md" ? "text-[12px]" : "text-[14px]"
                    } ${
                      fontScale === s
                        ? "bg-[var(--color-gold)] text-black border-transparent"
                        : "border-border text-fg-muted hover:text-fg hover:border-fg-subtle"
                    }`}
                  >
                    Aa
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {chapters === null ? (
        <div className="flex-1 flex items-center justify-center text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div
          ref={rowRef}
          className="flex-1 min-h-0 flex px-5 pb-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          {[leftVersion, rightVersion].map((id, i) => {
            const verses = chapters[id];
            const isLeft = i === 0;
            const pane = (
              <div
                key={`${id}-${i}`}
                style={{ flex: isLeft ? `0 0 calc(${splitPercent}% - 8px)` : "1 1 auto" }}
                className="min-w-0 flex flex-col rounded-2xl bg-elevated-hover/60 ring-1 ring-border overflow-hidden"
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
                          className={`${FONT_SCALE_CLASSES[fontScale]} leading-relaxed text-fg mb-2 ${
                            isSelected
                              ? "bg-gold/15 border-l-[3px] pl-2 -ml-0.5 py-1 rounded-r-lg"
                              : ""
                          }`}
                          style={isSelected ? { borderColor: "var(--color-gold-dark)" } : undefined}
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
            if (!isLeft) return pane;
            // Drag handle rendered right after the left pane, so it sits
            // between the two panes in DOM/flex order — the right pane's
            // `flex: 1 1 auto` only works if the handle already claimed its
            // own space before that remainder is computed.
            return (
              <Fragment key={`${id}-${i}-group`}>
                {pane}
                <div
                  onPointerDown={handleDragStart}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  role="separator"
                  aria-label="Resize comparison panes"
                  aria-orientation="vertical"
                  className="shrink-0 w-4 flex items-center justify-center cursor-col-resize touch-none"
                >
                  <span className="w-1 h-10 rounded-full bg-fg-subtle/30" />
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
