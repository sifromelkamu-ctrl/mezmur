import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  glow: "brand" | "cyan" | "red" | "gold" | "violet";
  onClick: () => void;
}

const GLOW_CLASSES: Record<QuickAction["glow"], string> = {
  brand: "from-brand/30 to-brand/5 text-brand-glow shadow-[0_0_22px_-4px_rgba(124,92,255,0.55)]",
  cyan: "from-accent-cyan/30 to-accent-cyan/5 text-accent-cyan shadow-[0_0_22px_-4px_rgba(49,215,255,0.5)]",
  red: "from-accent-red/30 to-accent-red/5 text-accent-red shadow-[0_0_22px_-4px_rgba(224,72,60,0.5)]",
  gold: "from-gold/30 to-gold/5 text-gold shadow-[0_0_22px_-4px_rgba(243,201,105,0.55)]",
  violet: "from-accent-violet/30 to-accent-violet/5 text-accent-violet shadow-[0_0_22px_-4px_rgba(139,92,246,0.5)]",
};

export default function QuickActionGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="grid gap-2 mb-10" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 group active:scale-95 transition-transform min-w-0"
          >
            <span
              className={`w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br ${GLOW_CLASSES[action.glow]} ring-1 ring-white/10 backdrop-blur-xl transition-transform duration-300 group-hover:scale-105 group-hover:ring-white/20`}
            >
              <Icon size={20} strokeWidth={2} />
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
