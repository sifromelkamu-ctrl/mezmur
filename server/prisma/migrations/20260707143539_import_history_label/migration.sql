-- Adds a purely cosmetic, admin-editable label to the import history record.
-- This is additive only — nothing the import pipeline itself reads or
-- writes is touched. Renaming a history entry never affects the pipeline.

-- AlterTable
ALTER TABLE "YoutubeImportBatch" ADD COLUMN "label" TEXT;
