// BibleModeNav lives in App.tsx, outside Bible.tsx — but every one of its
// destinations (home, Old Testament, New Testament, settings) is internal
// React state inside the single Bible.tsx component (no sub-routes exist
// for /bible, see that file's own comment on why), so navigate("/bible")
// alone can't reach them, and does nothing at all when already on that
// route. Same in-memory listener-set shape as artworkEvents.ts, for the
// same reason: simpler and more React-idiomatic here than a DOM
// CustomEvent for a signal that only ever has one subscriber (the mounted
// Bible page) at a time.
export type BibleNavAction = "home" | "ot" | "nt" | "settings";

type Listener = (action: BibleNavAction) => void;
const listeners = new Set<Listener>();

export function emitBibleNavAction(action: BibleNavAction) {
  for (const listener of listeners) listener(action);
}

export function onBibleNavAction(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
