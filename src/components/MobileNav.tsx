import { BookOpen, Home, Library, Search } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { prefetchRoute } from "../lib/prefetchRoute";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center justify-center flex-1 py-[2.5px] mx-0.5 rounded-2xl transition-all duration-300 active:scale-[0.94] ${
    // fg-based, not literal white — in dark mode fg is white, so this is
    // pixel-identical to before; in light mode fg is near-black, so the
    // same "raised frosted panel" reads as a soft tinted panel against the
    // light cream bar instead of vanishing (a literal white tint on an
    // already near-white background has essentially no contrast to see).
    isActive
      ? "bg-gradient-to-b from-fg/14 to-fg/6 ring-1 ring-inset ring-fg/10 shadow-[inset_0_1px_1px_color-mix(in_oklab,var(--color-fg)_15%,transparent)]"
      : ""
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
  // Matches the reference iOS 26 tab bar: the active item sits inside a
  // raised, lightly-frosted capsule (the parent NavLink's own glass gradient
  // + inset highlight, see itemClass), with its icon further picked out in
  // a solid accent-filled circle badge (white icon on brand color) —
  // inactive items stay plain, no circle, so the one active badge reads as
  // a clear focal point rather than every tab getting the same treatment.
  return (
    <span className="flex flex-col items-center justify-center gap-[2.5px]">
      <span
        className={`flex items-center justify-center w-[46px] h-[46px] rounded-full transition-all duration-300 ${
          isActive ? "bg-brand/70 shadow-[0_2px_8px_-1px_color-mix(in_oklab,var(--color-brand)_45%,transparent)]" : ""
        }`}
      >
        <Icon
          size={19}
          strokeWidth={isActive ? 2.2 : 1.9}
          fill={isActive ? "currentColor" : "none"}
          className={`transition-all duration-200 ${isActive ? "text-white scale-105" : "text-fg-subtle"}`}
        />
      </span>
      <span
        className={`font-sans text-[11px] font-semibold leading-none tracking-wide transition-colors duration-200 ${
          isActive ? "text-fg" : "text-fg-subtle"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export default function MobileNav() {
  const { t } = useLanguage();

  return (
    <nav className="relative overflow-hidden w-full flex items-center rounded-full bg-elevated/75 backdrop-blur-2xl ring-1 ring-brand/25 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.55)] px-[7px] py-[5px]">
      {/* Liquid-glass sheen: a soft top-lit gradient across the whole pill,
          as if it's a curved, lit-from-above surface — plus the sharper rim
          highlights tracing the top/bottom edges where the "glass" catches
          the most light. Together these read as one continuous refractive
          material instead of a flat tinted rectangle. fg-based rather than
          literal white for the same reason as the active capsule above —
          stays visible against the light-mode bar instead of just
          disappearing into an already-light background. */}
      <div className="absolute inset-0 bg-gradient-to-b from-fg/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-fg/60 to-transparent pointer-events-none" />
      <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-fg/15 to-transparent pointer-events-none" />
      <NavLink to="/" end className={itemClass}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Home} label={t("home")} />}
      </NavLink>
      <NavLink to="/library" className={itemClass} onPointerDown={() => prefetchRoute("/library")} onMouseEnter={() => prefetchRoute("/library")}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Library} label={t("yourLibrary")} />}
      </NavLink>
      <NavLink to="/search" className={itemClass} onPointerDown={() => prefetchRoute("/search")} onMouseEnter={() => prefetchRoute("/search")}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={Search} label={t("search")} />}
      </NavLink>
      <NavLink to="/bible" className={itemClass} onPointerDown={() => prefetchRoute("/bible")} onMouseEnter={() => prefetchRoute("/bible")}>
        {({ isActive }) => <NavIcon isActive={isActive} Icon={BookOpen} label="Bible" />}
      </NavLink>
    </nav>
  );
}
