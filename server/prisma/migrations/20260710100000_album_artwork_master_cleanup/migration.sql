-- "Album Artwork Is Master Artwork": a track that belongs to an album now
-- always shows that album's coverUrl/artworkFrame, resolved live at read
-- time (see toTrackDTO) — its own coverUrl/artworkFrame columns are never
-- read again, and hasCustomArtwork no longer has any meaning at all (there
-- is no more per-track override to distinguish). This links every existing
-- album track to its parent album's artwork automatically: clear the
-- now-unused per-track values so no stale/conflicting data is left behind,
-- then drop the column. Standalone singles (albumId IS NULL) are untouched
-- and keep using their own coverUrl/artworkFrame exactly as before.

UPDATE "Track" SET "coverUrl" = NULL, "artworkFrame" = NULL WHERE "albumId" IS NOT NULL;

ALTER TABLE "Track" DROP COLUMN IF EXISTS "hasCustomArtwork";
