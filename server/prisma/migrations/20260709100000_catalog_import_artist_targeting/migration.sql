-- Explicit artist targeting + import summary bookkeeping for catalog
-- import. All columns are nullable/additive — existing batches/items are
-- unaffected and old in-flight imports keep working.

ALTER TABLE "YoutubeImportBatch" ADD COLUMN IF NOT EXISTS "targetArtistId" TEXT;
ALTER TABLE "YoutubeImportBatch" ADD COLUMN IF NOT EXISTS "existingAlbumTitlesSnapshot" JSONB;

ALTER TABLE "YoutubeImportItem" ADD COLUMN IF NOT EXISTS "trackWasNew" BOOLEAN;
ALTER TABLE "YoutubeImportItem" ADD COLUMN IF NOT EXISTS "albumWasNew" BOOLEAN;
