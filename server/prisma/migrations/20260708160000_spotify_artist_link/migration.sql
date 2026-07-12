-- Manual Spotify artist linking: track when an artist-scoped Spotify
-- catalog sync last succeeded/failed. spotifyId already exists (added in
-- 20260708150000_add_spotify_sync_fields) and is repurposed from a fuzzy-
-- match cache into the definitive linked Spotify artist ID.

ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "spotifyLastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "spotifyLastSyncError" TEXT;
