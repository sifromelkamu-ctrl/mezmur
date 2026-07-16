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
  // Last known playback position, in seconds — powers the Continue
  // Listening cards' progress bar/"3:24 / 5:48" label on Home. Absent (not
  // 0) until at least one position save has happened, so a track that was
  // only ever glanced at doesn't render a bar frozen at the very start.
  positionSeconds?: number;
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

// Called periodically (throttled) and on pause by PlayerContext — a no-op
// if the track has since fallen out of the recently-played log entirely
// (e.g. bumped off the end by MAX_ENTRIES), rather than resurrecting it.
export function recordPosition(trackId: string, seconds: number): void {
  try {
    const entries = load();
    const idx = entries.findIndex((e) => e.trackId === trackId);
    if (idx === -1) return;
    entries[idx] = { ...entries[idx], positionSeconds: seconds };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // best-effort, see recordPlayed above
  }
}

export function getPosition(trackId: string): number {
  return load().find((e) => e.trackId === trackId)?.positionSeconds ?? 0;
}
