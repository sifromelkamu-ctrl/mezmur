// Sibling to artworkEvents.ts, same reason: PlayerContext's currentTrack/
// queue are a snapshot loaded once into memory, not something that
// naturally re-fetches — so a title/artist-name edit saved from Now
// Playing needs to be pushed into that snapshot directly instead of
// waiting for a re-fetch that (for a currently-playing track) may never
// happen. Kept as its own bus rather than folded into artworkEvents so
// each stays about one kind of edit.
import type { ApiTrack } from "./api";

export interface TrackMetadataChangedEvent {
  trackId: string;
  patch: { title?: string; artistName?: string };
}

type Listener = (event: TrackMetadataChangedEvent) => void;
const listeners = new Set<Listener>();

export function emitTrackMetadataChanged(event: TrackMetadataChangedEvent) {
  for (const listener of listeners) listener(event);
}

export function onTrackMetadataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTrackMetadataPatch(event: TrackMetadataChangedEvent, track: ApiTrack): ApiTrack {
  if (event.trackId !== track.id) return track;
  return {
    ...track,
    ...(event.patch.title !== undefined ? { title: event.patch.title } : {}),
    ...(event.patch.artistName !== undefined ? { artistName: event.patch.artistName } : {}),
  };
}
