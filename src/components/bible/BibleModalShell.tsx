import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface BibleModalShellProps {
  icon: LucideIcon;
  title: string;
  count: number;
  countLabel: { singular: string; plural: string };
  accent: string;
  accentSoft: string;
  emptyIcon: LucideIcon;
  emptyLabel: string;
  onClose: () => void;
  children: ReactNode;
}

// Shared chrome for the four Quick Access modals (Bookmarks/Notes/
// Favorites/History) — each has its own bespoke card design for its list
// (they show genuinely different content), but this is the part that was
// identical bureaucracy repeated four times: a plain title + count + X,
// flat background, and a stray sentence for the empty case. One shared
// shell instead: an accent-tinted wash behind an icon medallion + title,
// and a real designed empty state (icon + heading + subtext) rather than
// one gray line floating alone.
export default function BibleModalShell({
  icon: Icon,
  title,
  count,
  countLabel,
  accent,
  accentSoft,
  emptyIcon: EmptyIcon,
  emptyLabel,
  onClose,
  children,
}: BibleModalShellProps) {
  return createPortal(
    <div className="bible-scope fixed inset-0 z-50 bg-elevated overflow-y-auto overscroll-y-contain">
      <div
        className="relative pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, ${accent} 20%, transparent) 0%, transparent 70%)`,
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(env(safe-area-inset-top) + 7rem)",
          marginBottom: "calc(-1 * (env(safe-area-inset-top) + 7rem))",
        }}
      />
      <div
        className="relative max-w-2xl mx-auto px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.3)]"
              style={{ background: accentSoft }}
            >
              <Icon size={20} style={{ color: accent }} />
            </span>
            <div>
              <h2 className="font-agbalumo text-2xl font-bold leading-none" style={{ color: accent }}>
                {title}
              </h2>
              <p className="text-xs text-fg-muted mt-1">
                {count} {count === 1 ? countLabel.singular : countLabel.plural}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {count === 0 ? (
          <div className="flex flex-col items-center text-center py-20 px-6">
            <span className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: accentSoft }}>
              <EmptyIcon size={26} style={{ color: accent }} />
            </span>
            <p className="text-sm text-fg-muted max-w-[220px]">{emptyLabel}</p>
          </div>
        ) : (
          <div className="space-y-3">{children}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
