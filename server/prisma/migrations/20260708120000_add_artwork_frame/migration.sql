-- Adds an admin-only, non-destructive artwork framing field (pan/zoom/
-- rotate/flip/crop metadata) to every artwork-bearing model. Purely
-- additive and nullable — null means "no manual edit yet, use the smart
-- framing default." Never touches the original image/coverUrl/photoUrl.

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "artworkFrame" JSONB;

-- AlterTable
ALTER TABLE "Album" ADD COLUMN IF NOT EXISTS "artworkFrame" JSONB;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "artworkFrame" JSONB;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN IF NOT EXISTS "artworkFrame" JSONB;
