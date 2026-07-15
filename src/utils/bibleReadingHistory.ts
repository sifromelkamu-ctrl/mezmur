// Lightweight, localStorage-backed reading history — same client-only
// persistence pattern as src/lib/recentlyPlayed.ts. Two separate stores:
// a small recency-ordered log (for the "Recently Read" row, capped so it
// doesn't grow unbounded) and an uncapped set of every chapter ever opened
// (for the Old/New Testament progress bars — capping this would make
// progress silently regress for anyone who reads more than the cap).
export interface ReadEntry {
  bookSlug: string;
  chapter: number;
  readAt: number;
}

const HISTORY_KEY = "mezmur:bible-reading-history";
const HISTORY_MAX = 30;
const READ_SET_KEY = "mezmur:bible-read-chapters";

function loadHistory(): ReadEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ReadEntry[]) : [];
  } catch {
    return [];
  }
}

function loadReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_SET_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function recordChapterRead(bookSlug: string, chapter: number): void {
  try {
    const history = loadHistory().filter((e) => !(e.bookSlug === bookSlug && e.chapter === chapter));
    history.unshift({ bookSlug, chapter, readAt: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));

    const readSet = loadReadSet();
    readSet.add(`${bookSlug}:${chapter}`);
    localStorage.setItem(READ_SET_KEY, JSON.stringify([...readSet]));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — reading
    // history is a best-effort personalization signal, never worth
    // breaking the reading view over.
  }
}

export function getRecentHistory(limit = HISTORY_MAX): ReadEntry[] {
  return loadHistory().slice(0, limit);
}

export function getReadChapterKeys(): Set<string> {
  return loadReadSet();
}
