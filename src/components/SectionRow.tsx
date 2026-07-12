import { Children } from "react";
import type { ReactNode } from "react";

type SectionAccent = "brand" | "gold" | "green" | "violet" | "sky" | "red" | "cyan";

const ACCENT_CLASSES: Record<SectionAccent, string> = {
  brand: "from-brand to-brand-dark",
  gold: "from-gold to-gold-dark",
  green: "from-accent-green to-emerald-800",
  violet: "from-accent-violet to-indigo-900",
  sky: "from-accent-sky to-blue-900",
  red: "from-accent-red to-rose-900",
  cyan: "from-accent-cyan to-blue-900",
};

interface SectionRowProps {
  title: string;
  onShowAll?: () => void;
  dense?: boolean;
  scroll?: boolean;
  large?: boolean;
  accent?: SectionAccent;
  children: ReactNode;
  // The scroll row bleeds edge-to-edge via a negative margin that must
  // exactly cancel the page wrapper's own horizontal padding — a mismatch
  // here leaves the row a few pixels wider than the viewport, which shows up
  // as page-wide horizontal rubber-banding on mobile. Pass the page
  // wrapper's actual padding (in px) rather than trusting a hardcoded
  // Tailwind class to stay in sync with every caller. Defaults to 24 (px-6),
  // ArtistDetail's page padding — Home passes 20 (px-5) explicitly.
  edgeInset?: number;
}

export default function SectionRow({
  title,
  onShowAll,
  dense = false,
  scroll = false,
  large = false,
  accent = "brand",
  children,
  edgeInset = 24,
}: SectionRowProps) {
  return (
    <section className={large ? "mb-10" : "mb-8"}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className={`w-1 h-6 rounded-full bg-gradient-to-b ${ACCENT_CLASSES[accent]}`} />
          <h2 className={`font-bold tracking-tight ${large ? "text-2xl" : "text-xl"}`}>{title}</h2>
        </div>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="text-sm font-semibold text-fg-muted hover:text-brand transition-colors shrink-0"
          >
            Show all
          </button>
        )}
      </div>
      {scroll ? (
        <div
          className="flex overflow-x-auto overscroll-x-contain no-scrollbar pb-1 scroll-smooth gap-3"
          style={{ marginInline: `-${edgeInset}px`, paddingInline: `${edgeInset}px` }}
        >
          {Children.map(children, (child) => (
            <div className={`shrink-0 ${large ? "w-40" : "w-28"}`}>{child}</div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-3 ${dense ? "grid-cols-4" : "grid-cols-2"}`}>{children}</div>
      )}
    </section>
  );
}
