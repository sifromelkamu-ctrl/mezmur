import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  id: string;
  label: string;
  // Small stat line under the label ("127 New", "18 Albums", ...) — purely
  // informational, not a badge/count-to-clear.
  count: string;
  icon: LucideIcon;
  onClick: () => void;
}

// Outline gold icons on a soft tinted circle, not the solid glossy orbs
// used elsewhere in the app (Library, the bottom nav) — Home has its own
// fixed warm-gold identity independent of the accent color picker, same
// idea as the Bible section's pinned teal, so this never reads var(--color-
// brand) at all.
export default function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-elevated/50 backdrop-blur-xl ring-1 ring-border shadow-[0_10px_28px_-16px_rgba(0,0,0,0.45)] px-3 py-5 mb-10">
      {/* Specular highlight — a thin light line along the top edge, like
          glass catching light, for a more premium/dimensional card. */}
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={action.onClick}
              className="flex flex-col items-center gap-2 group active:scale-95 transition-transform min-w-0"
            >
              <span className="w-14 h-14 rounded-full flex items-center justify-center bg-gold/10 ring-1 ring-gold/30 transition-all duration-300 group-hover:bg-gold/15 group-hover:ring-gold/50">
                <Icon size={21} strokeWidth={2} className="text-gold" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-fg text-center leading-[1.15] w-full line-clamp-2">
                {action.label}
              </span>
              <span className="text-[10px] text-fg-subtle text-center -mt-1">{action.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
