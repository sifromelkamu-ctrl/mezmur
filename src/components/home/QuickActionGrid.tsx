import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  glow: "brand" | "cyan" | "red" | "gold" | "violet";
  onClick: () => void;
}

// CSS var references (not hex) so "brand" tracks whichever accent color the
// user picks in Settings — a solid icon-on-color orb keeps the icon legible
// against its own tile no matter the hue, unlike the old translucent-tint
// style where the icon and background were the same color family and
// nearly disappeared into each other (worst in light mode).
const GLOW_COLOR: Record<QuickAction["glow"], string> = {
  brand: "var(--color-brand)",
  cyan: "var(--color-accent-cyan)",
  red: "var(--color-accent-red)",
  gold: "var(--color-gold-dark)",
  violet: "var(--color-accent-violet)",
};

export default function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid gap-2 mb-10" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map((action) => {
        const Icon = action.icon;
        const color = GLOW_COLOR[action.glow];
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 group active:scale-95 transition-transform min-w-0"
          >
            <span
              className="tile-glow w-14 h-14 rounded-full flex items-center justify-center ring-1 ring-white/25 transition-transform duration-300 group-hover:scale-105 group-hover:ring-white/45"
              style={{
                "--tile-glow": `color-mix(in oklab, ${color} 65%, transparent)`,
                background: `radial-gradient(120% 120% at 30% 22%, color-mix(in oklab, ${color} 45%, white) 0%, ${color} 55%, color-mix(in oklab, ${color} 80%, black) 100%)`,
              } as CSSProperties}
            >
              <Icon size={21} strokeWidth={2.25} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" />
            </span>
            <span className="text-[10.5px] font-semibold text-fg-muted text-center leading-[1.15] w-full line-clamp-2">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
