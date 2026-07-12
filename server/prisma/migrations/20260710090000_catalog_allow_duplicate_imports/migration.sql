-- "Allow duplicate imports" toggle for catalog import. Additive/nullable —
-- existing batches default to allowDuplicates = false (today's skip-
-- duplicates behavior, unchanged).

ALTER TABLE "YoutubeImportBatch" ADD COLUMN IF NOT EXISTS "allowDuplicates" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "YoutubeImportBatch" ADD COLUMN IF NOT EXISTS "duplicateAlbumMap" JSONB;
