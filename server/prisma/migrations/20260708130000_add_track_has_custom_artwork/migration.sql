-- "Album Artwork Becomes Master Artwork": a track with hasCustomArtwork =
-- false always mirrors its album's coverUrl/artworkFrame (kept in sync by
-- the propagation helper). Defaults to false so every existing track starts
-- out following its album, matching current behavior where track covers
-- were simply copied from the album at import time.
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "hasCustomArtwork" BOOLEAN NOT NULL DEFAULT false;
