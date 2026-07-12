export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface VerseAnnotation {
  color?: HighlightColor;
  note?: string;
}

type AnnotationMap = Record<string, VerseAnnotation>;

const STORAGE_KEY = "mezmur:bible-annotations";

export function verseKey(bookSlug: string, chapter: number, verseIndex: number): string {
  return `${bookSlug}:${chapter}:${verseIndex}`;
}

function loadAll(): AnnotationMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AnnotationMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: AnnotationMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadChapterAnnotations(bookSlug: string, chapter: number): AnnotationMap {
  const all = loadAll();
  const prefix = `${bookSlug}:${chapter}:`;
  const result: AnnotationMap = {};
  for (const key in all) {
    if (key.startsWith(prefix)) result[key] = all[key];
  }
  return result;
}

export function setHighlight(key: string, color: HighlightColor | null) {
  const all = loadAll();
  const entry = { ...all[key] };
  if (color) entry.color = color;
  else delete entry.color;
  if (!entry.color && !entry.note) delete all[key];
  else all[key] = entry;
  saveAll(all);
  return all[key];
}

export function setNote(key: string, note: string) {
  const all = loadAll();
  const entry = { ...all[key] };
  const trimmed = note.trim();
  if (trimmed) entry.note = trimmed;
  else delete entry.note;
  if (!entry.color && !entry.note) delete all[key];
  else all[key] = entry;
  saveAll(all);
  return all[key];
}

export const HIGHLIGHT_COLORS: { id: HighlightColor; swatch: string; bg: string }[] = [
  { id: "yellow", swatch: "bg-yellow-400", bg: "bg-yellow-400/20" },
  { id: "green", swatch: "bg-green-400", bg: "bg-green-400/20" },
  { id: "blue", swatch: "bg-blue-400", bg: "bg-blue-400/20" },
  { id: "pink", swatch: "bg-pink-400", bg: "bg-pink-400/20" },
  { id: "purple", swatch: "bg-purple-400", bg: "bg-purple-400/20" },
];
