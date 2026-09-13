import { tracksApi, type ApiTrack } from "./api";
import { cachedDetailFetch } from "./detailCache";

// R2-hosted tracks need a signed URL minted before they can play at all
// (see PlayerContext's loading effect) — a real network round trip that,
// unlike the old permanent audioUrl, always sits on the critical path
// between tapping a row and hearing sound. Mirrors prefetchRoute.ts's own
// touch-start-before-tap-finishes trick: warm the same cached fetch a track
// row's own play button will use, so by the time the tap actually lands the
// signed URL is often already in hand instead of the full round trip
// happening after the fact. Legacy Supabase tracks (a real audioUrl
// already) have nothing to prefetch — they play immediately either way.
export function prefetchTrackAudio(track: Pick<ApiTrack, "id" | "audioUrl" | "hasAudio">) {
  if (track.audioUrl || !track.hasAudio) return;
  streamUrlFetch(track.id).catch(() => {});
}

// Same cache key convention as the prefetch above, so PlayerContext's own
// load-on-play effect resolves instantly from here when the prefetch already
// finished, and shares the in-flight request when it's still running.
export function streamUrlFetch(trackId: string): Promise<{ url: string }> {
  return cachedDetailFetch(`stream-url:${trackId}`, () => tracksApi.getStreamUrl(trackId));
}
