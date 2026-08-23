import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ENGLISH_VERSION_LABELS, ENGLISH_VERSION_OPTIONS, type EnglishVersion } from "../../utils/bibleReadingPrefs";

type BookText = Record<string, string[]>;

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

interface VersionResult {
  id: EnglishVersion | "am";
  label: string;
  text: string | null;
}

interface BibleCompareModalProps {
  bookSlug: string;
  chapter: number;
  verseIndices: number[];
  reference: string;
  onClose: () => void;
}

// Every version this reader has data for (Amharic + the four public-domain
// English translations — see bibleReadingPrefs.ts's own note on why no
// modern/copyrighted translation like NIV is bundled) fetched side by side
// for the exact verse(s) the reader had selected, so "Compare" always shows
// the full set the app actually has rather than just the two versions
// (current language + one alternate) already visible on screen.
export default function BibleCompareModal({ bookSlug, chapter, verseIndices, reference, onClose }: BibleCompareModalProps) {
  const [results, setResults] = useState<VersionResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sorted = [...verseIndices].sort((a, b) => a - b);

    const load = async () => {
      const targets: { id: EnglishVersion | "am"; label: string; path: string }[] = [
        { id: "am", label: "አማርኛ", path: `/bible/${bookSlug}.json` },
        ...ENGLISH_VERSION_OPTIONS.map((v) => ({
          id: v,
          label: ENGLISH_VERSION_LABELS[v],
          path: `/bible/en/${v}/${bookSlug}.json`,
        })),
      ];
      const settled = await Promise.all(
        targets.map(async (t) => {
          const data = await fetchBookOrNull(t.path);
          const verses = data?.[chapter];
          const text = verses ? sorted.map((i) => verses[i]).filter(Boolean).join(" ") : null;
          return { id: t.id, label: t.label, text: text || null };
        })
      );
      if (!cancelled) setResults(settled);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [bookSlug, chapter, verseIndices]);

  return createPortal(
    <div
      className="bible-scope fixed inset-0 z-50 bg-elevated overflow-y-auto overscroll-y-contain p-5 pb-10"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 2rem)" }}
    >
      <div className="max-w-2xl mx-auto">
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
        <p className="text-xs text-fg-muted mb-5">{reference} across every translation available.</p>

        {results === null ? (
          <div className="flex items-center justify-center py-16 text-fg-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((r) => (
              <div key={r.id} className="rounded-2xl p-4 bg-elevated-hover/60 ring-1 ring-border">
                <p className="text-xs font-bold uppercase tracking-wide text-gold mb-1.5">{r.label}</p>
                <p className="text-[0.95rem] leading-relaxed text-fg">
                  {r.text ?? <span className="text-fg-subtle italic">Not available for this book.</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
