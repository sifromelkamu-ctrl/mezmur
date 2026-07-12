-- Spotify Catalog Sync: cache which Spotify entity each row was matched to
-- (spotifyId), plus fields only Spotify sources (copyright/label/popularity).
-- All nullable/optional — purely additive, no existing behavior changes.

ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "spotifyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Artist_spotifyId_key" ON "Artist"("spotifyId");

ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "spotifyId" TEXT;
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "copyright" TEXT;
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "recordLabel" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Album_spotifyId_key" ON "Album"("spotifyId");

ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "spotifyId" TEXT;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "popularity" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "Track_spotifyId_key" ON "Track"("spotifyId");
