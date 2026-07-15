import { BookOpen, Home, Library, Search } from "lucide-react";
import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center justify-center flex-1 py-1.5 transition-colors ${
    isActive ? "text-fg" : "text-fg-subtle"
  }`;

function NavIcon({
  isActive,
  Icon,
  label,
}: {
  isActive: boolean;
  Icon: typeof Home;
  label: string;
}) {
  // Active state used to be a translucent brand-tinted circle with a
  // brand-colored icon on top — same hue on both layers, so the icon
  // nearly disappeared into its own background (worst in light mode).
  // A solid orb with a white icon keeps it legible in any theme/accent.
  return (
    <span className="flex flex-col items-center justify-center gap-0.5">
      <span
        className={`tile-glow flex items-center justify-center w-11 h-9 rounded-full transition-all duration-300 ${
          isActive ? "ring-1 ring-white/25" : ""
        }`}
        style={
          isActive
            ? ({
                "--tile-glow": "color-mix(in oklab, var(--color-brand) 70%, transparent)",
                background:
                  "radial-gradient(120% 130% at 35% 25%, color-mix(in oklab, var(--color-brand) 45%, white) 0%, var(--color-brand) 55%, color-mix(in oklab, var(--color-brand) 80%, black) 100%)",
              } as CSSProperties)
            : undefined
        }
      >
        <Icon
          size={19}
          strokeWidth={isActive ? 2.4 : 2}
          className={isActive ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : ""}
        />
      </span>
      <span className={`font-sans text-[9.5px] font-medium leading-none tracking-wide ${isActive ? "text-brand" : "text-fg-subtle"}`}>
        {label}
      </span>
    </span>
  );
}

export default function MobileNav() {
  const { t } = useLanguage();

  return (
    <nav className="relative overflow-hidden w-full flex items-center rounded-full bg-elevated/90 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] px-1 py-1">
      {/* Same specular highlight as the quick-action card, for a matching
          glass-premium finish across Home's chrome. */}
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
      <NavLink to="/" end className={itemClass}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Home} label={t("home")} />}
      </NavLink>
      <NavLink to="/search" className={itemClass}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Search} label={t("search")} />}
      </NavLink>
      <NavLink to="/library" className={itemClass}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Library} label={t("yourLibrary")} />}
      </NavLink>
      <NavLink to="/bible" className={itemClass}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={BookOpen} label="Bible" />}
      </NavLink>
    </nav>
  );
}
