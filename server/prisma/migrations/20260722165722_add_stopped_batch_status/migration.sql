-- Add "stopped" to YoutubeImportBatchStatus (admin manually stopped an
-- in-progress catalog import batch)
ALTER TYPE "YoutubeImportBatchStatus" ADD VALUE 'stopped';
