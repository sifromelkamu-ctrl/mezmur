import { BookOpen, Home, Leaf, Music, Settings2 } from "lucide-react";
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
  // Black + gold for the center button specifically — the app's own
  // classic premium identity (the dark/gold theme every other section
  // uses, WORD_ART_TITLE, the verse-image card's navy/gold look) rather
  // than a purple variant, so this one button reads as unmistakably
  // "Mezmur" against the Bible section's own purple/green bar around it.
  const gold = isLight ? "#f3c969" : "#d4af37";
  const goldGlow = isLight ? "#ffe3a3" : "#e4c765";

  // OT/NT icons match TESTAMENT_THEME's own old/new icons in Bible.tsx
  // (BookOpen / Leaf) — same real Old/New Testament progress + book list
  // those cards already show, just reachable from the bottom bar too.
  const items: { id: "home" | "ot"; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Bible", icon: Home },
    { id: "ot", label: "OT", icon: BookOpen },
  ];
  const itemsEnd: { id: "nt" | "settings"; label: string; icon: typeof Home }[] = [
    { id: "nt", label: "NT", icon: Leaf },
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

      {/* Center action — back to the main Mezmur app. A music note instead
          of the "M" wordmark letter — Mezmur is a music app first, so the
          note is a more direct "this is the music app" than a monogram.
          Black-to-black gradient + a bright gold ring, gold note — this
          app's own dark/gold premium look, carried onto this one button
          so it reads as unmistakably "Mezmur" against the Bible section's
          own purple/green bar around it.
          Wrapped in its own flex-1 slot (same as the other four) rather
          than a fixed shrink-0 width, so it claims an equal fifth of the
          row's width and its circle centers inside that — true 5-column
          alignment instead of a fixed-size badge floating off-center
          between two flex-1 groups. Sized to the row's own natural
          height (44px, down from 52px) so it reads as part of the row's
          proportions, not oversized next to the real icon buttons. */}
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={() => navigate("/")}
          aria-label="Back to Mezmur"
          className="relative flex items-center justify-center w-11 h-11 rounded-full shrink-0 overflow-hidden active:scale-90 transition-transform shadow-lg"
          style={{
            backgroundImage: "radial-gradient(120% 120% at 30% 20%, #2b2b2b 0%, #141414 55%, #000000 100%)",
            boxShadow: `0 8px 20px -6px rgba(0,0,0,0.85), inset 0 0 0 1.5px ${gold}`,
          }}
        >
          <span
            className="absolute inset-x-1 top-0.5 h-1/2 rounded-full pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent)" }}
          />
          <Music
            size={19}
            strokeWidth={2}
            className="relative"
            style={{ color: gold, filter: `drop-shadow(0 0 6px ${goldGlow}66) drop-shadow(0 1px 3px rgba(0,0,0,0.6))` }}
          />
        </button>
      </div>

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
