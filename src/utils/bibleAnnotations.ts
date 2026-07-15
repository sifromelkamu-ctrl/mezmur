export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export interface VerseAnnotation {
  color?: HighlightColor;
  note?: string;
  favorite?: boolean;
}

type AnnotationMap = Record<string, VerseAnnotation>;

const STORAGE_KEY = "mezmur:bible-annotations";

export function verseKey(bookSlug: string, chapter: number, verseIndex: number): string {
  return `${bookSlug}:${chapter}:${verseIndex}`;
}

export function parseVerseKey(key: string): { bookSlug: string; chapter: number; verseIndex: number } {
  const [bookSlug, chapter, verseIndex] = key.split(":");
  return { bookSlug, chapter: Number(chapter), verseIndex: Number(verseIndex) };
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

function isEmpty(entry: VerseAnnotation): boolean {
  return !entry.color && !entry.note && !entry.favorite;
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

// Whole-library scans, used by the Bookmarks/Notes/Favorites quick-access
// lists on the Bible home screen — small enough (one small object per
// annotated verse, not per verse in the whole Bible) to just filter the
// full map rather than maintaining separate indexes.
export function getAllAnnotations(): { key: string; annotation: VerseAnnotation }[] {
  const all = loadAll();
  return Object.entries(all).map(([key, annotation]) => ({ key, annotation }));
}

export function setHighlight(key: string, color: HighlightColor | null) {
  const all = loadAll();
  const entry = { ...all[key] };
  if (color) entry.color = color;
  else delete entry.color;
  if (isEmpty(entry)) delete all[key];
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
  if (isEmpty(entry)) delete all[key];
  else all[key] = entry;
  saveAll(all);
  return all[key];
}

export function setFavorite(key: string, favorite: boolean) {
  const all = loadAll();
  const entry = { ...all[key] };
  if (favorite) entry.favorite = true;
  else delete entry.favorite;
  if (isEmpty(entry)) delete all[key];
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
