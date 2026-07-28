export type MediaSource = "music" | "bible";

// Lets the music player and Bible audio each know when the OTHER one starts
// playing, so starting one stops the other — only one audio source should
// ever be active at once, the same way a phone's audio focus works.
type Listener = (source: MediaSource) => void;
const listeners = new Set<Listener>();

export function emitMediaStarted(source: MediaSource) {
  for (const listener of listeners) listener(source);
}

export function onMediaStarted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
