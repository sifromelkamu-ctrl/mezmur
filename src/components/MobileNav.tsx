import { BookOpen, Home, Library, Search } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center justify-center flex-1 py-2.5 transition-colors ${
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
  return (
    <span
      className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 ${
        isActive ? "bg-brand/20 shadow-[0_0_16px_-2px_rgba(124,92,255,0.8)]" : ""
      }`}
    >
      <Icon size={20} strokeWidth={isActive ? 2.4 : 2} className={isActive ? "text-brand-glow" : ""} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default function MobileNav() {
  const { t } = useLanguage();

  return (
    <nav
      className="w-full flex items-center rounded-full bg-elevated/90 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] px-1 py-1"
    >
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
