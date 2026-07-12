import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export class ApiError extends Error {
  status: number;
  // Present only on a 429 response whose body carried a retryAfter (seconds)
  // — lets callers implement a cooldown without re-parsing the message text.
  retryAfterSeconds?: number;
  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed with status ${res.status}`, data.retryAfter);
  }
  return data as T;
}

async function uploadFile<T>(path: string, fieldName: string, file: File): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = new FormData();
  body.append(fieldName, file);

  const res = await fetch(`${API_URL}${path}`, { method: "PATCH", headers, body });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Upload failed with status ${res.status}`);
  }
  return data as T;
}

async function postForm<T>(path: string, body: FormData): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Upload failed with status ${res.status}`);
  }
  return data as T;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role?: "user" | "artist" | "admin";
}

// Non-destructive artwork framing (Universal Artwork System's admin
// editor). Describes how to present the existing photoUrl/coverUrl inside
// a square — the original image is never modified. x/y are the focal point
// as a fraction (0-1) of the natural image; zoom is relative to "whole
// image fit inside the square" (zoom 1 = nothing cropped).
export interface ArtworkFrame {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

export type ArtworkEntityType = "artist" | "album" | "track" | "playlist";

// Home Featured Banner system — see server/src/featuredBanners.ts. Only
// "album" is wired up to an actual admin flow today; the rest exist so this
// type (and the admin picker) can grow later without reshaping anything else.
export type FeaturedBannerEntityType = "album" | "single" | "artist" | "playlist" | "concert";

export interface ApiArtist {
  id: string;
  name: string;
  bio: string;
  gradient: [string, string];
  monthlyListeners: number;
  isGroup: boolean;
  photoUrl?: string;
  ownerId?: string | null;
  artworkFrame?: ArtworkFrame;
  spotifyArtistId?: string;
  spotifyArtistUrl?: string;
  spotifyLastSyncedAt?: string;
  spotifyLastSyncError?: string;
}

export type ApiAlbumType = "album" | "ep" | "single" | "live" | "compilation";

export interface ApiAlbum {
  id: string;
  title: string;
  year?: number;
  gradient: [string, string];
  coverUrl?: string;
  description?: string;
  albumType: ApiAlbumType;
  releaseDate?: string;
  genre?: string;
  artistId: string;
  artistName?: string;
  trackCount?: number;
  totalDuration?: number;
  artworkFrame?: ArtworkFrame;
}

export interface ApiTrack {
  id: string;
  title: string;
  duration: number;
  language: string | null;
  genre?: string;
  audioUrl?: string;
  coverUrl?: string;
  moods?: string[];
  playCount?: number;
  trackNumber?: number;
  discNumber?: number;
  // Null for a Single import that didn't match any existing artist (see
  // server/src/youtube/pipeline.ts's findExistingArtist) — artistName is
  // still populated from the raw imported name in that case.
  artistId: string | null;
  artistName?: string;
  albumId: string | null;
  albumTitle?: string;
  gradient: [string, string];
  // "Album Artwork Is Master Artwork": for a track with an albumId, this is
  // always the album's own coverUrl/artworkFrame (resolved server-side in
  // toTrackDTO) — never a separate per-track value. Only standalone
  // singles (albumId: null) carry their own.
  artworkFrame?: ArtworkFrame;
}

export interface ApiPlaylist {
  id: string;
  title: string;
  description: string;
  gradient: [string, string];
  coverUrl?: string;
  ownerId?: string | null;
  trackIds?: string[];
  tracks?: ApiTrack[];
  artworkFrame?: ArtworkFrame;
}

export interface ApiSermon {
  id: string;
  title: string;
  speaker: string;
  description: string;
  duration: number;
  gradient: [string, string];
}

export interface ApiPodcast {
  id: string;
  title: string;
  host: string;
  description: string;
  duration: number;
  gradient: [string, string];
}

// The Home hero carousel's data shape — every field already resolved
// (override applied, or fallen back to the entity's own title/artist/cover)
// server-side. See GET /api/featured-banners.
export interface ApiFeaturedBanner {
  id: string;
  entityType: FeaturedBannerEntityType;
  entityId: string;
  title: string;
  subtitle: string;
  badgeText: string;
  buttonText: string;
  imageUrl?: string;
  gradient: [string, string];
}

// The admin settings page's shape — carries both the raw override fields
// (for editing) and the resolved fallback values (for previewing what will
// actually render). See GET /api/admin/featured-banners.
export interface ApiFeaturedBannerAdmin {
  id: string;
  entityType: FeaturedBannerEntityType;
  entityId: string;
  title?: string;
  subtitle?: string;
  badgeText?: string;
  buttonText?: string;
  bannerImageUrl?: string;
  displayOrder: number;
  enabled: boolean;
  resolvedTitle: string;
  resolvedSubtitle: string;
  resolvedImageUrl?: string;
  gradient: [string, string];
  entityMissing: boolean;
}

export interface ApiArtistDetail extends ApiArtist {
  albums: ApiAlbum[];
  topTracks: ApiTrack[];
}

export interface ApiAlbumDetail extends ApiAlbum {
  tracks: ApiTrack[];
}

export interface ApiSearchResults {
  tracks: ApiTrack[];
  artists: ApiArtist[];
  albums: ApiAlbum[];
  playlists: ApiPlaylist[];
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  user: ApiUser;
}

export const authApi = {
  register: (email: string, password: string, name?: string) =>
    request<AuthSession>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: ApiUser }>("/auth/me"),
  updateMe: (name: string) =>
    request<{ user: ApiUser }>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
};

export interface ArtistMetadataInput {
  name?: string;
  bio?: string;
}

export interface AlbumMetadataInput {
  title?: string;
  description?: string;
  albumType?: ApiAlbumType;
  releaseDate?: string;
  genre?: string;
}

export interface TrackMetadataInput {
  title?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  genre?: string;
  language?: string;
  albumId?: string | null;
}

export const artistsApi = {
  list: () => request<ApiArtist[]>("/artists"),
  get: (id: string) => request<ApiArtistDetail>(`/artists/${id}`),
  mine: () => request<ApiArtistDetail[]>("/artists/mine"),
  create: (name: string) => request<ApiArtist>("/artists", { method: "POST", body: JSON.stringify({ name }) }),
  update: (id: string, input: ArtistMetadataInput) =>
    request<ApiArtist>(`/artists/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/artists/${id}`, { method: "DELETE" }),
  addAlbum: (artistId: string, title: string) =>
    request<ApiAlbum>(`/artists/${artistId}/albums`, { method: "POST", body: JSON.stringify({ title }) }),
  uploadPhoto: (id: string, file: File) => uploadFile<ApiArtist>(`/artists/${id}/photo`, "photo", file),
  removePhoto: (id: string) => request<ApiArtist>(`/artists/${id}/photo`, { method: "DELETE" }),
};

export const albumsApi = {
  list: () => request<ApiAlbum[]>("/albums"),
  get: (id: string) => request<ApiAlbumDetail>(`/albums/${id}`),
  update: (id: string, input: AlbumMetadataInput) =>
    request<ApiAlbum>(`/albums/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/albums/${id}`, { method: "DELETE" }),
  uploadCover: (id: string, file: File) => uploadFile<ApiAlbum>(`/albums/${id}/cover`, "cover", file),
  removeCover: (id: string) => request<ApiAlbum>(`/albums/${id}/cover`, { method: "DELETE" }),
  reorder: (id: string, trackIds: string[]) =>
    request<void>(`/albums/${id}/reorder`, { method: "POST", body: JSON.stringify({ trackIds }) }),
};

export const playlistsApi = {
  list: () => request<ApiPlaylist[]>("/playlists"),
  mine: () => request<ApiPlaylist[]>("/playlists/mine"),
  get: (id: string) => request<ApiPlaylist>(`/playlists/${id}`),
  create: (title: string, description?: string) =>
    request<ApiPlaylist>("/playlists", { method: "POST", body: JSON.stringify({ title, description }) }),
  remove: (id: string) => request<void>(`/playlists/${id}`, { method: "DELETE" }),
  addTrack: (playlistId: string, trackId: string) =>
    request<void>(`/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ trackId }) }),
  removeTrack: (playlistId: string, trackId: string) =>
    request<void>(`/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" }),
  uploadCover: (id: string, file: File) => uploadFile<ApiPlaylist>(`/playlists/${id}/cover`, "cover", file),
};

export const searchApi = {
  search: (q: string) => request<ApiSearchResults>(`/search?q=${encodeURIComponent(q)}`),
};

export const tracksApi = {
  list: () => request<ApiTrack[]>("/tracks"),
  trending: (limit = 12) => request<ApiTrack[]>(`/tracks/trending?limit=${limit}`),
  byMood: (mood: string) => request<ApiTrack[]>(`/tracks?mood=${encodeURIComponent(mood)}`),
  byLanguage: (language: string) => request<ApiTrack[]>(`/tracks?language=${encodeURIComponent(language)}`),
  byEra: (era: "classic" | "new") => request<ApiTrack[]>(`/tracks?era=${era}`),
  recordPlay: (id: string) => request<void>(`/tracks/${id}/play`, { method: "POST" }),
  update: (id: string, input: TrackMetadataInput) =>
    request<ApiTrack>(`/tracks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
};

export const sermonsApi = {
  list: () => request<ApiSermon[]>("/sermons"),
  get: (id: string) => request<ApiSermon>(`/sermons/${id}`),
};

export const podcastsApi = {
  list: () => request<ApiPodcast[]>("/podcasts"),
  get: (id: string) => request<ApiPodcast>(`/podcasts/${id}`),
};

// A dedicated, admin-curated category — never regular albums, never
// auto-derived from "newest"/"recently imported" (see server/src/routes/
// concerts.ts). Reuses albumsApi.get() for a single concert's detail view
// since a concert is still an Album row server-side, just filtered out of
// every other album-facing endpoint.
export const concertsApi = {
  list: () => request<ApiAlbum[]>("/concerts"),
};

// A dedicated category too: a track with no album at all — never a regular
// album, never a concert album (see server/src/routes/singles.ts).
export const singlesApi = {
  list: () => request<ApiTrack[]>("/singles"),
};

// The Home hero carousel reads only from this — never from newest/recently
// imported albums. See server/src/routes/featuredBanners.ts.
export const featuredBannersApi = {
  list: () => request<ApiFeaturedBanner[]>("/featured-banners"),
};

export interface AdminUploadTrackResult {
  track: ApiTrack;
  upload: { signedUrl: string; token: string; path: string };
}

export interface YoutubeImportJob {
  id: string;
  status: "pending" | "downloading" | "processing" | "uploading" | "saving" | "done" | "error";
  progress: number;
  message: string;
  error?: string;
  track?: ApiTrack;
}

type YoutubeCatalogItemStatus =
  | "pending"
  | "selected"
  | "downloading"
  | "processing"
  | "uploading"
  | "saving"
  | "done"
  | "error"
  | "skipped_duplicate";

export interface YoutubeCatalogItem {
  id: string;
  videoId: string;
  title: string;
  albumTitle: string | null;
  // Computed server-side from albumTitle (album if set, single if null) —
  // purely a display label, doesn't drive any behavior itself.
  kind: "album" | "single";
  position: number;
  thumbnailUrl: string | null;
  duration: number | null;
  selected: boolean;
  status: YoutubeCatalogItemStatus;
  progress: number;
  message: string | null;
  error: string | null;
  trackId: string | null;
  // Set once the item finishes (done or skipped_duplicate) — used to build
  // the import summary. See YoutubeImportItem in the Prisma schema.
  trackWasNew: boolean | null;
  albumWasNew: boolean | null;
}

type YoutubeCatalogBatchStatus = "enumerating" | "ready" | "importing" | "completed" | "completed_with_errors" | "error";

export interface YoutubeCatalogBatch {
  id: string;
  sourceUrl: string;
  channelName: string | null;
  label: string | null;
  status: YoutubeCatalogBatchStatus;
  error: string | null;
  createdAt: string;
  targetArtistId: string | null;
  allowDuplicates: boolean;
  items: YoutubeCatalogItem[];
}

export interface YoutubeCatalogBatchSummary {
  id: string;
  sourceUrl: string;
  channelName: string | null;
  label: string | null;
  status: YoutubeCatalogBatchStatus;
  error: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface YoutubeCatalogHistoryPage {
  total: number;
  page: number;
  pageSize: number;
  batches: YoutubeCatalogBatchSummary[];
}

export const adminApi = {
  uploadTrack: (input: {
    title: string;
    artistId: string;
    albumId?: string;
    genre?: string;
    duration: number;
    fileExt?: string;
  }) => request<AdminUploadTrackResult>("/admin/upload-track", { method: "POST", body: JSON.stringify(input) }),

  // The track row + signed URL come from uploadTrack(); this sends the
  // actual audio bytes straight to Supabase Storage, bypassing our server.
  putAudioFile: async (signedUrl: string, file: File) => {
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new ApiError(res.status, `Audio upload failed with status ${res.status}`);
  },

  uploadCover: (file: File, target: { trackId?: string; albumId?: string }) => {
    const body = new FormData();
    body.append("cover", file);
    if (target.trackId) body.append("trackId", target.trackId);
    if (target.albumId) body.append("albumId", target.albumId);
    return postForm<{ track?: ApiTrack; album?: ApiAlbum }>("/admin/upload-cover", body);
  },

  // Creates a real catalog artist/album (visible to every listener), unlike
  // artistsApi.create()/addAlbum() which create ones scoped to the calling
  // user's own personal collection.
  createArtist: (name: string) =>
    request<ApiArtist>("/admin/artists", { method: "POST", body: JSON.stringify({ name }) }),
  addAlbum: (artistId: string, title: string, albumType?: ApiAlbumType) =>
    request<ApiAlbum>(`/admin/artists/${artistId}/albums`, {
      method: "POST",
      body: JSON.stringify({ title, albumType }),
    }),

  // The "Edit Metadata" step's data source (Single destination only) —
  // fetches title/artist/thumbnail without downloading or creating anything,
  // so the admin can review and edit them before the real import runs.
  previewYoutubeImport: (url: string) =>
    request<{ title: string; artistName: string; thumbnail: string | null; duration: number | null }>(
      "/admin/youtube-import/preview",
      { method: "POST", body: JSON.stringify({ url }) }
    ),

  // Kicks off a background import job and returns immediately; poll
  // getYoutubeImportStatus() with the returned jobId for progress.
  startYoutubeImport: (input: {
    url: string;
    confirmRights: boolean;
    albumId?: string;
    genre?: string;
    isSingle?: boolean;
    // Confirmed values from the Edit Metadata step (Single destination only).
    titleOverride?: string;
    artistId?: string;
    artistName?: string;
    createArtist?: boolean;
  }) => request<{ jobId: string }>("/admin/youtube-import", { method: "POST", body: JSON.stringify(input) }),
  getYoutubeImportStatus: (jobId: string) =>
    request<YoutubeImportJob>(`/admin/youtube-import/${jobId}`),

  // Saves (or, with frame: null, clears back to the smart-framing default)
  // an artwork's manual pan/zoom/rotation/flip. Never touches the original
  // image — purely presentation metadata, applied everywhere that artwork
  // is rendered. This, plus direct upload/remove, is the only way artist
  // photos and album covers are ever set — there's no automatic import.
  setArtworkFrame: (entityType: ArtworkEntityType, entityId: string, frame: ArtworkFrame | null) =>
    request<{ artist?: ApiArtist; album?: ApiAlbum; track?: ApiTrack; playlist?: ApiPlaylist }>(
      "/admin/artwork-frame",
      { method: "PATCH", body: JSON.stringify({ entityType, entityId, frame }) }
    ),

  // Catalog (whole-channel) import: enumerate a channel's playlists/videos,
  // let the admin pick what to bring in, then queue the selected items.
  // The target artist is always chosen explicitly up front — either an
  // existing catalog artist (artistId) or a brand-new one (artistName,
  // hard-blocked with a 409 if a normalized-name match already exists).
  startYoutubeCatalogEnumeration: (input: {
    url?: string;
    urls?: string[];
    confirmRights: boolean;
    artistMode: "existing" | "new";
    artistId?: string;
    artistName?: string;
    // "Allow duplicate imports" — off by default (skip anything that
    // already exists). When true, every album/single/track in this batch
    // imports as a brand-new row instead of being matched/skipped.
    allowDuplicates?: boolean;
  }) => request<{ batchId: string }>("/admin/youtube-import/catalog", { method: "POST", body: JSON.stringify(input) }),
  listYoutubeCatalogBatches: (params?: { q?: string; status?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    const query = qs.toString();
    return request<YoutubeCatalogHistoryPage>(`/admin/youtube-import/catalog${query ? `?${query}` : ""}`);
  },
  getYoutubeCatalogBatch: (batchId: string) =>
    request<YoutubeCatalogBatch>(`/admin/youtube-import/catalog/${batchId}`),
  deleteYoutubeCatalogBatch: (batchId: string) =>
    request<void>(`/admin/youtube-import/catalog/${batchId}`, { method: "DELETE" }),
  deleteSelectedYoutubeCatalogBatches: (batchIds: string[]) =>
    request<{ deleted: number }>("/admin/youtube-import/catalog/delete-selected", {
      method: "POST",
      body: JSON.stringify({ batchIds }),
    }),
  clearCompletedYoutubeCatalogBatches: () =>
    request<{ deleted: number }>("/admin/youtube-import/catalog/clear-completed", { method: "POST" }),
  clearFailedYoutubeCatalogBatches: () =>
    request<{ deleted: number }>("/admin/youtube-import/catalog/clear-failed", { method: "POST" }),
  clearAllYoutubeCatalogBatches: () =>
    request<{ deleted: number }>("/admin/youtube-import/catalog/clear-all", { method: "POST" }),
  renameYoutubeCatalogBatch: (batchId: string, label: string | null) =>
    request<{ id: string; label: string | null }>(`/admin/youtube-import/catalog/${batchId}/label`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }),
  selectYoutubeCatalogItems: (
    batchId: string,
    input: {
      selected: boolean;
      all?: boolean;
      albumTitle?: string | null;
      // Bulk "Import Albums Only" / "Import Singles Only" filter.
      hasAlbum?: boolean;
      itemIds?: string[];
    }
  ) =>
    request<void>(`/admin/youtube-import/catalog/${batchId}/select`, { method: "POST", body: JSON.stringify(input) }),
  startYoutubeCatalogImport: (batchId: string) =>
    request<{ queued: number }>(`/admin/youtube-import/catalog/${batchId}/start`, { method: "POST" }),
  resumeYoutubeCatalogImport: (batchId: string) =>
    request<{ resumed: number }>(`/admin/youtube-import/catalog/${batchId}/resume`, { method: "POST" }),
};

// Extends ApiTrack with the two extra fields the admin "Edit Song" form
// needs (lyrics, releaseYear) that no other screen reads.
export interface ApiAdminTrack extends ApiTrack {
  lyrics?: string;
  releaseYear?: number;
}

export interface AdminTrackEditInput {
  title?: string;
  albumId?: string | null;
  artistId?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  genre?: string;
  language?: string;
  releaseYear?: number | null;
  lyrics?: string | null;
}

// Admin-only "Library Management" tools: reassigning a song's album/artist,
// moving/merging albums, deleting catalog songs/albums. Everything already
// possible via artistsApi/albumsApi/adminApi (rename, artwork, create album)
// is reused as-is by the Library Management page rather than duplicated here.
export const adminLibraryApi = {
  getTrack: (id: string) => request<ApiAdminTrack>(`/admin/library/tracks/${id}`),
  updateTrack: (id: string, input: AdminTrackEditInput) =>
    request<ApiAdminTrack>(`/admin/library/tracks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  moveTracks: (trackIds: string[], destinationAlbumId: string) =>
    request<{ movedCount: number; album: ApiAlbum }>("/admin/library/tracks/move", {
      method: "POST",
      body: JSON.stringify({ trackIds, destinationAlbumId }),
    }),
  deleteTrack: (id: string) => request<void>(`/admin/library/tracks/${id}`, { method: "DELETE" }),
  mergeAlbums: (sourceAlbumId: string, targetAlbumId: string) =>
    request<ApiAlbum>("/admin/library/albums/merge", {
      method: "POST",
      body: JSON.stringify({ sourceAlbumId, targetAlbumId }),
    }),
  deleteAlbum: (id: string) => request<void>(`/admin/library/albums/${id}`, { method: "DELETE" }),
  // Cascades server-side: also deletes every album and track by this
  // artist (and removes those tracks from any playlists that had them).
  deleteArtist: (id: string) => request<void>(`/admin/library/artists/${id}`, { method: "DELETE" }),
};

export interface FeaturedBannerUpdateInput {
  title?: string | null;
  subtitle?: string | null;
  badgeText?: string | null;
  buttonText?: string | null;
  enabled?: boolean;
}

// Settings -> Home Featured Banner. See server/src/routes/adminFeaturedBanners.ts.
export const adminFeaturedBannersApi = {
  list: () => request<ApiFeaturedBannerAdmin[]>("/admin/featured-banners"),
  create: (entityType: FeaturedBannerEntityType, entityId: string) =>
    request<ApiFeaturedBannerAdmin>("/admin/featured-banners", {
      method: "POST",
      body: JSON.stringify({ entityType, entityId }),
    }),
  update: (id: string, input: FeaturedBannerUpdateInput) =>
    request<ApiFeaturedBannerAdmin>(`/admin/featured-banners/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  uploadImage: (id: string, file: File) =>
    uploadFile<ApiFeaturedBannerAdmin>(`/admin/featured-banners/${id}/image`, "image", file),
  removeImage: (id: string) =>
    request<ApiFeaturedBannerAdmin>(`/admin/featured-banners/${id}/image`, { method: "DELETE" }),
  remove: (id: string) => request<void>(`/admin/featured-banners/${id}`, { method: "DELETE" }),
  reorder: (ids: string[]) =>
    request<void>("/admin/featured-banners/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
};

export function sermonToTrack(sermon: ApiSermon): ApiTrack {
  return {
    id: sermon.id,
    title: sermon.title,
    duration: sermon.duration,
    language: null,
    artistId: sermon.id,
    artistName: sermon.speaker,
    albumId: null,
    albumTitle: undefined,
    gradient: sermon.gradient,
  };
}

export function podcastToTrack(podcast: ApiPodcast): ApiTrack {
  return {
    id: podcast.id,
    title: podcast.title,
    duration: podcast.duration,
    language: null,
    artistId: podcast.id,
    artistName: podcast.host,
    albumId: null,
    albumTitle: undefined,
    gradient: podcast.gradient,
  };
}
