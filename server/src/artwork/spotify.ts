const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

export function isSpotifyConfigured(): boolean {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

// forceRefresh bypasses the cache even if the cached token looks unexpired —
// used to recover from a 401 that means the cached token was revoked/invalid
// despite our own expiry bookkeeping saying it should still be good.
async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (!isSpotifyConfigured()) return null;
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 5000) return cachedToken.token;

  try {
    const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.token;
  } catch {
    return null;
  }
}

// Thrown for any non-2xx response from Spotify (after the automatic 401
// retry below has already been attempted) — carries the status/body so
// callers can distinguish "rate limited" from "not found" from other
// failures, instead of every failure collapsing into an empty result.
export class SpotifyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    // Seconds to wait before retrying, parsed from Spotify's Retry-After
    // header on a 429 — undefined for every other status.
    public readonly retryAfterSeconds?: number
  ) {
    super(`Spotify API error ${status}`);
    this.name = "SpotifyApiError";
  }
}

// Thrown when the request to Spotify itself couldn't be made (DNS/TLS/
// connection failure) — distinct from SpotifyApiError so callers can show
// "Unable to connect to Spotify" instead of a misleading "not found".
export class SpotifyNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network error contacting Spotify");
    this.name = "SpotifyNetworkError";
  }
}

// Shared authenticated-fetch wrapper for the artist search/lookup paths
// (searchSpotifyArtist, getSpotifyArtistById): gets a token (refreshing
// automatically if the cached one has expired), retries exactly once with a
// forced token refresh on a 401 (the cached token can be rejected as invalid
// even before our own expiry bookkeeping says it should be), and throws a
// typed error for any other failure rather than silently swallowing it —
// callers that need the old "just give me null/[] on any failure" behavior
// (e.g. the catalog sync engine) wrap the call in their own try/catch.
async function spotifyFetch(url: string, attempt = 1): Promise<Response> {
  const token = await getAccessToken(attempt > 1);
  if (!token) throw new SpotifyApiError(401, "Spotify isn't configured or no access token could be obtained");

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new SpotifyNetworkError(err);
  }

  console.log(`HTTP Status: ${res.status}`);

  if (res.status === 401 && attempt === 1) {
    return spotifyFetch(url, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`Spotify error body: ${body}`);
    let retryAfterSeconds: number | undefined;
    if (res.status === 429) {
      const header = res.headers.get("retry-after");
      const parsed = header ? Number(header) : NaN;
      retryAfterSeconds = Number.isFinite(parsed) ? parsed : undefined;
      console.log(`Retry-After value: ${header ?? "(none)"}`);
    }
    throw new SpotifyApiError(res.status, body, retryAfterSeconds);
  }
  return res;
}

interface SpotifyAlbumImage {
  url: string;
  width: number;
  height: number;
}

interface SpotifyAlbumItem {
  name: string;
  artists: { name: string }[];
  release_date?: string;
  album_type?: string;
}

export interface SpotifyAlbumMatch {
  id: string;
  name: string;
  artistNames: string[];
  releaseDate?: string;
  albumType?: string;
  totalTracks?: number;
}

export interface SpotifyAlbumDetails {
  id: string;
  label?: string;
  copyrights: string[];
  genres: string[];
  popularity?: number;
}

// Label/copyrights/genres only come back from the full album lookup, not
// the search endpoint's simplified album objects — one extra call per
// confirmed match, not per candidate, to keep this cheap.
export async function getSpotifyAlbumDetails(albumId: string): Promise<SpotifyAlbumDetails | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id: string;
      label?: string;
      copyrights?: { text: string; type: string }[];
      genres?: string[];
      popularity?: number;
    };
    return {
      id: data.id,
      label: data.label,
      copyrights: (data.copyrights ?? []).map((c) => c.text),
      genres: data.genres ?? [],
      popularity: data.popularity,
    };
  } catch {
    return null;
  }
}

export interface SpotifyArtistMatch {
  id: string;
  name: string;
  images: SpotifyAlbumImage[];
  genres: string[];
  popularity?: number;
  followers?: number;
  externalUrl?: string;
}

interface RawSpotifyArtist {
  id: string;
  name: string;
  images: SpotifyAlbumImage[];
  genres: string[];
  popularity?: number;
  followers?: { total?: number };
  external_urls?: { spotify?: string };
}

function toArtistMatch(a: RawSpotifyArtist): SpotifyArtistMatch {
  return {
    id: a.id,
    name: a.name,
    images: a.images,
    genres: a.genres,
    popularity: a.popularity,
    followers: a.followers?.total,
    externalUrl: a.external_urls?.spotify,
  };
}

// Throws SpotifyApiError/SpotifyNetworkError on failure rather than
// swallowing to [] — callers (the admin search-artist route) need to tell
// "Spotify returned zero results" apart from "the request to Spotify
// failed", so they never show a misleading "not found" for a real error.
export async function searchSpotifyArtist(name: string): Promise<SpotifyArtistMatch[]> {
  const trimmed = name.trim();
  console.log("Searching Spotify:");
  console.log(`Query: ${trimmed}`);
  const encodedQuery = encodeURIComponent(trimmed);
  console.log(`Encoded Query: ${encodedQuery}`);

  if (trimmed.length < 2) return [];

  const url = `https://api.spotify.com/v1/search?q=${encodedQuery}&type=artist&limit=20`;
  const res = await spotifyFetch(url);
  const data = (await res.json()) as { artists?: { items: RawSpotifyArtist[] } };
  const results = (data.artists?.items ?? []).map(toArtistMatch);
  console.log(`Returned artists: ${results.length}`);
  return results;
}

// Accepts a bare Spotify artist ID, an open.spotify.com artist URL (with or
// without query params), or a spotify:artist: URI — the three input forms
// the manual-link search dialog's single field transparently supports.
// Spotify base62 IDs are always 22 characters.
export function extractSpotifyArtistId(input: string): string | null {
  const trimmed = input.trim();
  const bareIdMatch = /^[0-9A-Za-z]{22}$/.exec(trimmed);
  if (bareIdMatch) return trimmed;
  const urlMatch = /open\.spotify\.com\/artist\/([0-9A-Za-z]{22})/.exec(trimmed);
  if (urlMatch) return urlMatch[1];
  const uriMatch = /^spotify:artist:([0-9A-Za-z]{22})$/.exec(trimmed);
  if (uriMatch) return uriMatch[1];
  return null;
}

// Returns null only for a clean "not found" (404) — every other failure
// (rate limited, network error, etc.) throws SpotifyApiError/
// SpotifyNetworkError so callers that need to distinguish those (the resolve-
// artist route, the search modal's "verify already linked" check) can. The
// catalog sync engine's call site wraps this in its own try/catch to
// preserve its existing "skip artist-level update on any failure" behavior.
export async function getSpotifyArtistById(id: string): Promise<SpotifyArtistMatch | null> {
  try {
    const res = await spotifyFetch(`https://api.spotify.com/v1/artists/${id}`);
    const data = (await res.json()) as RawSpotifyArtist;
    return toArtistMatch(data);
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 404) return null;
    throw err;
  }
}

// Pulls every album/single/compilation released under one Spotify artist ID
// directly — the only album source the manual-link sync engine uses, so a
// synced catalog can never include another artist's release by mistake.
export async function getSpotifyArtistAlbums(id: string): Promise<SpotifyAlbumMatch[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const results: SpotifyAlbumMatch[] = [];
  const seenIds = new Set<string>();
  let url: string | null = `https://api.spotify.com/v1/artists/${id}/albums?${new URLSearchParams({
    include_groups: "album,single,compilation",
    limit: "50",
  })}`;

  while (url) {
    let data: { items: (SpotifyAlbumItem & { id: string; total_tracks?: number })[]; next: string | null };
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      data = (await res.json()) as typeof data;
    } catch {
      break;
    }
    for (const item of data.items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      results.push({
        id: item.id,
        name: item.name,
        artistNames: item.artists.map((a) => a.name),
        releaseDate: item.release_date,
        albumType: item.album_type,
        totalTracks: item.total_tracks,
      });
    }
    url = data.next;
  }
  return results;
}

export interface SpotifyAlbumTrack {
  id: string;
  name: string;
  trackNumber?: number;
  discNumber?: number;
  durationMs?: number;
}

// The album-tracks endpoint is cheap but doesn't carry popularity — see
// getSpotifyTracksPopularity for that, called separately only when needed.
export async function getSpotifyAlbumTracks(albumId: string): Promise<SpotifyAlbumTrack[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const results: SpotifyAlbumTrack[] = [];
  let url: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;

  while (url) {
    let data: {
      items: { id: string; name: string; track_number?: number; disc_number?: number; duration_ms?: number }[];
      next: string | null;
    };
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      data = (await res.json()) as typeof data;
    } catch {
      break;
    }
    for (const item of data.items) {
      results.push({
        id: item.id,
        name: item.name,
        trackNumber: item.track_number,
        discNumber: item.disc_number,
        durationMs: item.duration_ms,
      });
    }
    url = data.next;
  }
  return results;
}

// Batched (≤50 IDs per call, Spotify's max) lookup for the one field the
// cheaper album-tracks endpoint doesn't carry: popularity.
export async function getSpotifyTracksPopularity(ids: string[]): Promise<Map<string, number>> {
  const token = await getAccessToken();
  const result = new Map<string, number>();
  if (!token || ids.length === 0) return result;

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const url = `https://api.spotify.com/v1/tracks?${new URLSearchParams({ ids: batch.join(",") })}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const data = (await res.json()) as { tracks?: { id: string; popularity?: number }[] };
      for (const t of data.tracks ?? []) {
        if (t.popularity != null) result.set(t.id, t.popularity);
      }
    } catch {
      continue;
    }
  }
  return result;
}

export interface SpotifyTrackMatch {
  id: string;
  name: string;
  artistNames: string[];
  albumName: string;
  trackNumber?: number;
  discNumber?: number;
  popularity?: number;
  isrc?: string;
}

export async function searchSpotifyTrack(title: string, albumName: string, artistName: string): Promise<SpotifyTrackMatch[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const queries = [
    `track:${JSON.stringify(title)} artist:${JSON.stringify(artistName)}`,
    `${title} ${artistName}`,
  ];
  const results: SpotifyTrackMatch[] = [];
  const seenIds = new Set<string>();
  for (const query of [...new Set(queries)]) {
    try {
      const url = `https://api.spotify.com/v1/search?${new URLSearchParams({ q: query, type: "track", limit: "10" })}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        tracks?: {
          items: {
            id: string;
            name: string;
            artists: { name: string }[];
            album: { name: string };
            track_number?: number;
            disc_number?: number;
            popularity?: number;
            external_ids?: { isrc?: string };
          }[];
        };
      };
      for (const item of data.tracks?.items ?? []) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        results.push({
          id: item.id,
          name: item.name,
          artistNames: item.artists.map((a) => a.name),
          albumName: item.album.name,
          trackNumber: item.track_number,
          discNumber: item.disc_number,
          popularity: item.popularity,
          isrc: item.external_ids?.isrc,
        });
      }
    } catch {
      continue;
    }
  }
  return results;
}
