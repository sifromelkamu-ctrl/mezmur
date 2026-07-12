import type { ApiTrack, ArtworkEntityType, ArtworkFrame } from "./api";

// "No manual refresh required" for artwork changes: components that show a
// snapshot of server data outside the normal fetch-on-mount lifecycle (most
// notably PlayerContext's currentTrack/queue, which keep playing whatever
// they loaded even if the underlying row changes elsewhere) subscribe here
// to patch their own local copy the instant an edit is saved anywhere else
// in the app. Every other display site just re-fetches normally and needs
// nothing extra — this is only for the "currently in memory, not about to
// re-fetch" cases.
export interface ArtworkChangedEvent {
  entityType: ArtworkEntityType;
  entityId: string;
  patch: { coverUrl?: string | null; artworkFrame?: ArtworkFrame | null };
}

type Listener = (event: ArtworkChangedEvent) => void;
const listeners = new Set<Listener>();

export function emitArtworkChanged(event: ArtworkChangedEvent) {
  for (const listener of listeners) listener(event);
}

export function onArtworkChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Shared match rule: does this event apply to a given track, either
// directly (a standalone single's own edit) or via its album (every track
// in that album always mirrors it — see toTrackDTO)?
export function eventAppliesToTrack(event: ArtworkChangedEvent, track: Pick<ApiTrack, "id" | "albumId">) {
  if (event.entityType === "track") return event.entityId === track.id;
  if (event.entityType === "album") return event.entityId === track.albumId;
  return false;
}
