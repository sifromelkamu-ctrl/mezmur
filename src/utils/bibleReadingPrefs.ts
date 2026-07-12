export type FontSize = "sm" | "md" | "lg" | "xl";
export type FontFamily = "notoSans" | "notoSerif" | "abyssinica" | "menbere" | "agbalumo" | "googleSans" | "nyala";

export interface ReadingPrefs {
  fontSize: FontSize;
  fontFamily: FontFamily;
}

const STORAGE_KEY = "mezmur:bible-reading-prefs";

export const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
};

// The first six support the full Ethiopic Unicode block (verified against
// the Ge'ez/Amharic glyph set, not just Latin fallback) — each Tailwind
// token below is declared as a --font-* variable in src/index.css and
// loaded via Google Fonts in index.html. "Nyala" is a Microsoft font
// bundled with Windows/Office, not redistributable — it's referenced by
// name only, so it renders on systems that already have it installed and
// falls back to Noto Sans Ethiopic everywhere else.
export const FONT_FAMILY_CLASSES: Record<FontFamily, string> = {
  notoSans: "font-noto-sans-ethiopic",
  notoSerif: "font-noto-serif-ethiopic",
  abyssinica: "font-abyssinica",
  menbere: "font-menbere",
  agbalumo: "font-agbalumo",
  googleSans: "font-google-sans",
  nyala: "font-nyala",
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  notoSans: "Noto Sans",
  notoSerif: "Noto Serif",
  abyssinica: "Abyssinica SIL",
  menbere: "Menbere",
  agbalumo: "Agbalumo",
  googleSans: "Google Sans",
  nyala: "Nyala",
};

export const FONT_FAMILY_OPTIONS: FontFamily[] = [
  "notoSans",
  "notoSerif",
  "abyssinica",
  "menbere",
  "agbalumo",
  "googleSans",
  "nyala",
];

const DEFAULT_PREFS: ReadingPrefs = { fontSize: "md", fontFamily: "notoSans" };

export function loadReadingPrefs(): ReadingPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveReadingPrefs(prefs: ReadingPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
