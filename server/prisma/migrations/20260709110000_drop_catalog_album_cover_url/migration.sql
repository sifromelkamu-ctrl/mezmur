-- Catalog import no longer fetches/assigns any artwork, so the column that
-- existed solely to feed an album's cover during import is now dead data —
-- the per-item preview thumbnail (thumbnailUrl) already captures whatever's
-- needed for the admin's review screen and is computed independently.
ALTER TABLE "YoutubeImportItem" DROP COLUMN IF EXISTS "albumCoverUrl";
