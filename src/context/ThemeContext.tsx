import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { shade } from "../utils/colorExtraction";

export interface AccentTheme {
  id: string;
  name: string;
  brand: string;
  brandDark: string;
  brandGlow: string;
}

export const ACCENT_THEMES: AccentTheme[] = [
  { id: "purple", name: "Royal Purple", brand: "#7c5cff", brandDark: "#5b3fe0", brandGlow: "#a78bfa" },
  { id: "cyan", name: "Electric Cyan", brand: "#31d7ff", brandDark: "#0ea5c7", brandGlow: "#7ee8ff" },
  { id: "gold", name: "Soft Gold", brand: "#f3c969", brandDark: "#c9a34a", brandGlow: "#ffe3a3" },
  { id: "crimson", name: "Crimson", brand: "#e0483c", brandDark: "#b91c1c", brandGlow: "#f87171" },
  // Jewel-tone additions — deeper/richer mid-tones than the originals above
  // (rather than pastel), both so they read as more "premium" and so they
  // still hold up as plain text (nav labels, filter pills) on a light
  // background, not just as icon-on-color fills.
  { id: "emerald", name: "Deep Emerald", brand: "#059669", brandDark: "#047857", brandGlow: "#34d399" },
  { id: "sapphire", name: "Sapphire Blue", brand: "#2563eb", brandDark: "#1d4ed8", brandGlow: "#60a5fa" },
  { id: "rose", name: "Rose Quartz", brand: "#db2777", brandDark: "#9d174d", brandGlow: "#f9a8d4" },
  { id: "copper", name: "Burnt Copper", brand: "#c2410c", brandDark: "#7c2d12", brandGlow: "#fb923c" },
];

export interface AvatarColorOption {
  id: string;
  name: string;
  color: string;
}

// The "M" logo circle's own color, independent of the app's accent theme —
// a user might run a Crimson accent but still want their own avatar mark to
// stay a plain white. White is the default; the rest reuse the accent
// palette's hues so the two pickers feel like one coherent color system.
export const AVATAR_COLOR_OPTIONS: AvatarColorOption[] = [
  { id: "white", name: "White", color: "#ffffff" },
  ...ACCENT_THEMES.map((t) => ({ id: t.id, name: t.name, color: t.brand })),
];

// Resolves an avatarColorId to a background + a legible mark color on top
// of it — every option here is either white or a saturated brand hue, so a
// simple "white bg gets dark text, everything else gets white text" rule
// covers all of them without needing real contrast math.
export function getAvatarColor(id: string): { background: string; text: string } {
  const option = AVATAR_COLOR_OPTIONS.find((o) => o.id === id) ?? AVATAR_COLOR_OPTIONS[0];
  return { background: option.color, text: option.id === "white" ? "#1f1a17" : "#ffffff" };
}

const STORAGE_KEY = "mezmur:accent-theme";
const MODE_STORAGE_KEY = "mezmur:mode";
const AVATAR_COLOR_STORAGE_KEY = "mezmur:avatar-color";
const CUSTOM_COLOR_STORAGE_KEY = "mezmur:custom-accent-color";
const NOW_PLAYING_THEME_STORAGE_KEY = "mezmur:now-playing-theme";
const NOW_PLAYING_CUSTOM_COLOR_STORAGE_KEY = "mezmur:now-playing-custom-color";
const DEFAULT_AVATAR_COLOR_ID = "white";
const DEFAULT_THEME_ID = "emerald";
const DEFAULT_CUSTOM_COLOR = "#7c5cff";
// Now Playing's color is deliberately independent of the app-wide accent
// (see CUSTOM_THEME_ID's own comment) — picking a Royal Purple accent
// shouldn't also force Now Playing purple. It defaults to CUSTOM_THEME_ID
// with this exact hex so an install that never touches the new setting
// still gets Now Playing's original hand-picked teal look, unchanged.
const DEFAULT_NOW_PLAYING_CUSTOM_COLOR = "#1cc4a3";
// Anything that was ever the app-wide *default* (not a deliberate pick) goes
// here so switching the default later migrates every install still sitting
// on the old one forward, rather than leaving them stuck on a color that's
// no longer meant to be the baseline. "green"/"royal" predate ACCENT_THEMES
// entirely; "purple" was the default from the 2026 premium rebrand until
// Deep Emerald replaced it as the new default for everyone.
const LEGACY_DEFAULT_IDS = new Set(["green", "royal", "purple"]);

// Selecting this "theme" means the app-wide accent (buttons, glows, Now
// Playing background, everything else driven by --color-brand) comes from
// the user's own picked hex instead of one of the curated ACCENT_THEMES —
// the whole-app color-customization option this file exists to add.
export const CUSTOM_THEME_ID = "custom";

export type ThemeMode = "dark" | "light";

// Derives the dark/glow variants a picked-preset theme ships with by hand,
// so a freely-chosen custom color gets the same "feels like one deliberate
// palette" treatment instead of just being reused verbatim for all three
// CSS variables.
function resolveAccentTheme(themeId: string, customColor: string): AccentTheme {
  if (themeId === CUSTOM_THEME_ID) {
    return {
      id: CUSTOM_THEME_ID,
      name: "Custom",
      brand: customColor,
      brandDark: shade(customColor, 0.38, 1.05),
      brandGlow: shade(customColor, 0.72, 0.85),
    };
  }
  return (
    ACCENT_THEMES.find((t) => t.id === themeId) ??
    ACCENT_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ??
    ACCENT_THEMES[0]
  );
}

function applyTheme(theme: AccentTheme) {
  const root = document.documentElement;
  root.style.setProperty("--color-brand", theme.brand);
  root.style.setProperty("--color-brand-dark", theme.brandDark);
  root.style.setProperty("--color-brand-glow", theme.brandGlow);
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("light", mode === "light");
  // Native status bar (clock/network/battery row) content color has to be
  // set explicitly — it doesn't auto-adapt to page background the way a
  // browser's does. Overlay lets the app draw full-bleed behind it (same
  // premium edge-to-edge look as Spotify/Apple Music) instead of the OS
  // reserving a solid bar; Style.Light/.Dark below is Capacitor's naming
  // for the *content* color, inverted from how it sounds — Dark means
  // light/white text for dark backgrounds, Light means dark/black text.
  if (Capacitor.isNativePlatform()) {
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: mode === "light" ? Style.Light : Style.Dark });
  }
}

interface ThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  avatarColorId: string;
  setAvatarColorId: (id: string) => void;
  // The custom accent hex itself, and the setter that both stores it and
  // switches themeId to CUSTOM_THEME_ID so picking a color also selects it.
  customColor: string;
  setCustomColor: (hex: string) => void;
  // Whatever's actually active right now — one of ACCENT_THEMES or the
  // custom-color-derived one — so any screen (Settings, Now Playing) that
  // needs "the current app color" reads one thing instead of re-deriving
  // it from themeId/customColor itself.
  resolvedTheme: AccentTheme;
  // Now Playing's own color — same shape as the accent theme fields above,
  // but a fully separate selection so choosing an app-wide accent never
  // also changes Now Playing, and vice versa.
  nowPlayingThemeId: string;
  setNowPlayingThemeId: (id: string) => void;
  nowPlayingCustomColor: string;
  setNowPlayingCustomColor: (hex: string) => void;
  resolvedNowPlayingTheme: AccentTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored || LEGACY_DEFAULT_IDS.has(stored)) return DEFAULT_THEME_ID;
    return stored;
  });
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode | null) ?? "light"
  );
  const [avatarColorId, setAvatarColorIdState] = useState<string>(
    () => localStorage.getItem(AVATAR_COLOR_STORAGE_KEY) ?? DEFAULT_AVATAR_COLOR_ID
  );
  const [customColor, setCustomColorState] = useState<string>(
    () => localStorage.getItem(CUSTOM_COLOR_STORAGE_KEY) ?? DEFAULT_CUSTOM_COLOR
  );
  const [nowPlayingThemeId, setNowPlayingThemeIdState] = useState<string>(
    () => localStorage.getItem(NOW_PLAYING_THEME_STORAGE_KEY) ?? CUSTOM_THEME_ID
  );
  const [nowPlayingCustomColor, setNowPlayingCustomColorState] = useState<string>(
    () => localStorage.getItem(NOW_PLAYING_CUSTOM_COLOR_STORAGE_KEY) ?? DEFAULT_NOW_PLAYING_CUSTOM_COLOR
  );

  const resolvedTheme = useMemo(() => resolveAccentTheme(themeId, customColor), [themeId, customColor]);
  const resolvedNowPlayingTheme = useMemo(
    () => resolveAccentTheme(nowPlayingThemeId, nowPlayingCustomColor),
    [nowPlayingThemeId, nowPlayingCustomColor]
  );

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const setThemeId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeIdState(id);
  };

  const setMode = (next: ThemeMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, next);
    setModeState(next);
  };

  const setAvatarColorId = (id: string) => {
    localStorage.setItem(AVATAR_COLOR_STORAGE_KEY, id);
    setAvatarColorIdState(id);
  };

  const setCustomColor = (hex: string) => {
    localStorage.setItem(CUSTOM_COLOR_STORAGE_KEY, hex);
    setCustomColorState(hex);
    setThemeId(CUSTOM_THEME_ID);
  };

  const setNowPlayingThemeId = (id: string) => {
    localStorage.setItem(NOW_PLAYING_THEME_STORAGE_KEY, id);
    setNowPlayingThemeIdState(id);
  };

  const setNowPlayingCustomColor = (hex: string) => {
    localStorage.setItem(NOW_PLAYING_CUSTOM_COLOR_STORAGE_KEY, hex);
    setNowPlayingCustomColorState(hex);
    setNowPlayingThemeId(CUSTOM_THEME_ID);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        setThemeId,
        mode,
        setMode,
        avatarColorId,
        setAvatarColorId,
        customColor,
        setCustomColor,
        resolvedTheme,
        nowPlayingThemeId,
        setNowPlayingThemeId,
        nowPlayingCustomColor,
        setNowPlayingCustomColor,
        resolvedNowPlayingTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
