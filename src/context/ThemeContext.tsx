import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

const STORAGE_KEY = "mezmur:accent-theme";
const MODE_STORAGE_KEY = "mezmur:mode";
const DEFAULT_THEME_ID = "purple";
// The app shipped with "green" (Emerald) as its hardcoded default for a long
// time, so most existing installs have it saved even though the user never
// deliberately chose it — the 2026 premium rebrand replaces that default
// outright rather than leaving old installs stuck on a color that no longer
// exists in ACCENT_THEMES.
const LEGACY_DEFAULT_IDS = new Set(["green", "royal"]);

export type ThemeMode = "dark" | "light";

function applyTheme(theme: AccentTheme) {
  const root = document.documentElement;
  root.style.setProperty("--color-brand", theme.brand);
  root.style.setProperty("--color-brand-dark", theme.brandDark);
  root.style.setProperty("--color-brand-glow", theme.brandGlow);
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("light", mode === "light");
}

interface ThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored || LEGACY_DEFAULT_IDS.has(stored)) return DEFAULT_THEME_ID;
    return stored;
  });
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode | null) ?? "dark"
  );

  useEffect(() => {
    const theme = ACCENT_THEMES.find((t) => t.id === themeId) ?? ACCENT_THEMES[0];
    applyTheme(theme);
  }, [themeId]);

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

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId, mode, setMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
