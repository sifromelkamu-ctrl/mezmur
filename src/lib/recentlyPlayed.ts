// Lightweight, localStorage-backed "recently played" log — the same
// client-only persistence pattern as FavoritesContext, used as one of the
// personal signals for src/lib/recommendations.ts. Not a React context: it's
// only ever read in bulk (recommendation scoring), never rendered live, so a
// plain module keeps every playTrack() call site untouched.
const STORAGE_KEY = "mezmur:recently-played";
const MAX_ENTRIES = 50;

interface RecentlyPlayedEntry {
  trackId: string;
  playedAt: number;
}

function load(): RecentlyPlayedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentlyPlayedEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordPlayed(trackId: string): void {
  try {
    const entries = load().filter((e) => e.trackId !== trackId);
    entries.unshift({ trackId, playedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — recently-
    // played is a best-effort personalization signal, never worth breaking
    // playback over.
  }
}

export function getRecentlyPlayedIds(limit = MAX_ENTRIES): string[] {
  return load()
    .slice(0, limit)
    .map((e) => e.trackId);
}
