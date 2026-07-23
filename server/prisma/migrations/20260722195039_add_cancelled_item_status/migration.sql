-- Add "cancelled" to YoutubeImportItemStatus (admin manually cancelled one
-- item via the per-item X button)
ALTER TYPE "YoutubeImportItemStatus" ADD VALUE 'cancelled';
