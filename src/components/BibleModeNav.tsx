import { BookOpen, Home, Plus, Settings2, Volume2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { emitBibleNavAction } from "../lib/bibleNavEvents";

// A deliberately distinct nav from MobileNav (different accent, different
// shape for its center action) — the whole point is that /bible reads as
// its own "mode" with its own chrome, not just another tab inside the main
// app's nav. Rendered in place of MobileNav only on /bible (see App.tsx).
//
// Four of its five actions have no route of their own to navigate to —
// /bible has no sub-routes at all (every book/chapter/search view inside
// it is internal React state, see Bible.tsx's own comment on why) — so
// they go through emitBibleNavAction instead of react-router, the same
// kind of in-memory signal artworkEvents.ts already uses elsewhere for
// "tell the one mounted listener about this" cases. The center button is
// the one genuine route change: back out to the main app entirely.
export default function BibleModeNav() {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const isLight = mode === "light";
  // Matches BIBLE_HOME_THEME_LIGHT/DARK's own --bible-purple values
  // (Bible.tsx) — those are scoped CSS custom properties set on that
  // page's own root div, not reachable from here (this nav renders in
  // App.tsx's fixed bottom bar, a separate part of the tree), so the same
  // two hex values are just repeated directly.
  const purple = isLight ? "#5B3FE0" : "#8B6CFF";

  const items: { id: "home" | "browse" | "audio" | "settings"; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "browse", label: "Bible", icon: BookOpen },
  ];
  const itemsEnd: { id: "audio" | "settings"; label: string; icon: typeof Home }[] = [
    { id: "audio", label: "Audio", icon: Volume2 },
    { id: "settings", label: "More", icon: Settings2 },
  ];

  return (
    <nav
      className="relative flex items-center justify-between w-full rounded-full bg-elevated/75 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.55)] px-[7px] py-[5px]"
      style={{ boxShadow: `0 18px 44px -14px rgba(0,0,0,0.55), inset 0 0 0 1px ${purple}40` }}
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => emitBibleNavAction(id)}
          className="flex-1 flex flex-col items-center gap-[2.5px] py-1.5 rounded-2xl active:scale-[0.94] transition-transform"
        >
          <Icon size={19} strokeWidth={1.9} className="text-fg-subtle" />
          <span className="text-[11px] font-semibold text-fg-subtle">{label}</span>
        </button>
      ))}

      {/* Center "cross" action — the way back to the main Mezmur app,
          styled as an actual cross (not a generic "+") since this is the
          one button that belongs to the Bible identity rather than a
          repurposed app icon. Raised above the pill's own line, solid
          fill, so it reads as the one deliberately different element in
          the bar. */}
      <button
        onClick={() => navigate("/")}
        aria-label="Back to Mezmur"
        className="relative -mt-7 flex items-center justify-center w-[52px] h-[52px] rounded-full shrink-0 active:scale-90 transition-transform shadow-lg"
        style={{ background: purple, boxShadow: `0 10px 24px -6px ${purple}99` }}
      >
        <Plus size={24} strokeWidth={2.4} className="text-white" />
      </button>

      {itemsEnd.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => emitBibleNavAction(id)}
          className="flex-1 flex flex-col items-center gap-[2.5px] py-1.5 rounded-2xl active:scale-[0.94] transition-transform"
        >
          <Icon size={19} strokeWidth={1.9} className="text-fg-subtle" />
          <span className="text-[11px] font-semibold text-fg-subtle">{label}</span>
        </button>
      ))}
    </nav>
  );
}
