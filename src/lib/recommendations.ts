// Personalized "Recommended for You" — v1 heuristic engine built entirely
// from data the app already has (favorites, recently-played, the listener's
// own playlists, and global play counts) rather than a new ML pipeline or
// any new tracking infrastructure. A pure function, deliberately decoupled
// from React/PlayerContext: callers (Home.tsx, Recommended.tsx) already own
// playTrack, so this module only returns data — never a callback — keeping
// it trivially testable.
//
// Track-only by design: a mix of individual songs, never albums/artists/
// playlists.
import type { ApiArtist, ApiPlaylist, ApiTrack, ArtworkFrame } from "./api";

export interface RecommendationItem {
  id: string;
  title: string;
  subtitle: string;
  gradient: [string, string];
  photoUrl?: string;
  // Undefined for a Single with no linked artist and no album — nothing
  // sensible to navigate to, so the card just isn't clickable-through.
  to?: string;
  entityId: string;
  artworkFrame?: ArtworkFrame;
  track: ApiTrack;
}

export interface BuildRecommendationsInput {
  artists: ApiArtist[];
  tracks: ApiTrack[];
  favoriteTracks: ApiTrack[];
  recentlyPlayedIds: string[];
  // The listener's own playlists — used only as a taste SIGNAL (their
  // contents feed the taste anchors below), never recommended themselves.
  ownedPlaylists: ApiPlaylist[];
}

// Below this many distinct taste anchors (artist + genre combined), personal
// signal is too thin to trust — a brand-new or logged-out listener falls
// straight through to the trending/popular fallback instead.
const MIN_TASTE_ANCHORS = 4;

function trackToItem(t: ApiTrack): RecommendationItem {
  return {
    id: t.id,
    title: t.title,
    subtitle: t.artistName ?? "",
    gradient: t.gradient,
    photoUrl: t.coverUrl,
    // Deliberately never falls back to the artist's profile page — a
    // recommended track tile should just play on click, not navigate away.
    to: t.albumId ? `/album/${t.albumId}` : undefined,
    entityId: t.id,
    artworkFrame: t.artworkFrame,
    track: t,
  };
}

export function buildRecommendations(input: BuildRecommendationsInput, limit = 20): RecommendationItem[] {
  const { tracks, favoriteTracks, recentlyPlayedIds, ownedPlaylists } = input;

  const tracksById = new Map(tracks.map((t) => [t.id, t]));
  const recentTracks = recentlyPlayedIds.map((id) => tracksById.get(id)).filter((t): t is ApiTrack => Boolean(t));
  const ownedPlaylistTracks = ownedPlaylists.flatMap((p) => p.tracks ?? []);
  const signalTracks = [...favoriteTracks, ...recentTracks, ...ownedPlaylistTracks];

  const artistWeight = new Map<string, number>();
  const genreWeight = new Map<string, number>();
  const seenTrackIds = new Set<string>();
  for (const t of signalTracks) {
    seenTrackIds.add(t.id);
    // An unmatched Single has no artistId — skip artist weighting for it
    // rather than lumping every artistless single together as "one artist".
    if (t.artistId) artistWeight.set(t.artistId, (artistWeight.get(t.artistId) ?? 0) + 1);
    if (t.genre) genreWeight.set(t.genre, (genreWeight.get(t.genre) ?? 0) + 1);
  }

  const hasEnoughSignal = artistWeight.size + genreWeight.size >= MIN_TASTE_ANCHORS;

  // Shared across both branches below — greedily picks from a pre-sorted
  // candidate list while skipping any track whose artist is already
  // represented, so "For You" never shows the same artist twice on one
  // page (a personalized listener's top-scored tracks otherwise cluster
  // heavily around whichever one artist dominates their taste signal).
  // Tracks with no artistId (unmatched Singles) are never constrained by
  // this — there's no artist identity for them to collide on.
  const usedArtistIds = new Set<string>();
  const pickDiverse = (candidates: ApiTrack[], count: number): ApiTrack[] => {
    const picked: ApiTrack[] = [];
    for (const t of candidates) {
      if (picked.length >= count) break;
      if (t.artistId && usedArtistIds.has(t.artistId)) continue;
      picked.push(t);
      if (t.artistId) usedArtistIds.add(t.artistId);
    }
    return picked;
  };

  let items: RecommendationItem[] = [];

  if (hasEnoughSignal) {
    const scoreTrack = (t: ApiTrack) =>
      (t.artistId ? (artistWeight.get(t.artistId) ?? 0) : 0) * 3 +
      (t.genre ? (genreWeight.get(t.genre) ?? 0) * 2 : 0) +
      Math.min(t.playCount ?? 0, 50) * 0.02;

    const scored = tracks
      .filter((t) => !seenTrackIds.has(t.id))
      .map((t) => ({ track: t, score: scoreTrack(t) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.track);

    items = pickDiverse(scored, limit).map(trackToItem);
  }

  if (items.length < limit) {
    const existingIds = new Set(items.map((i) => i.id));
    const trendingCandidates = [...tracks]
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .filter((t) => !existingIds.has(t.id));
    const trending = pickDiverse(trendingCandidates, limit - items.length).map(trackToItem);
    items = [...items, ...trending];
  }

  return items.slice(0, limit);
}
