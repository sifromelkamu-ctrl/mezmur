// Lightweight, localStorage-backed "saved" marker for Home's hero banners —
// same client-only persistence pattern as recentlyPlayed.ts. Powers the "+"
// button next to "Play Now": a simple personal bookmark on the featured
// post itself, independent of following the artist or favoriting a track.
const STORAGE_KEY = "mezmur:saved-banners";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function save(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable — best-effort, never worth breaking over
  }
}

export function isBannerSaved(id: string): boolean {
  return load().has(id);
}

export function toggleBannerSaved(id: string): boolean {
  const set = load();
  const next = !set.has(id);
  if (next) set.add(id);
  else set.delete(id);
  save(set);
  return next;
}
