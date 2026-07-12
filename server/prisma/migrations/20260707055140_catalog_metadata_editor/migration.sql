-- Adds fields for the standalone, post-import catalog metadata editor.
-- None of these are populated by the importer — they exist purely for
-- admins to manually fill in after a track/album/artist already exists.

-- AlterTable
ALTER TABLE "Album" ADD COLUMN "releaseDate" TIMESTAMP(3),
ADD COLUMN "genre" TEXT,
ADD COLUMN "copyright" TEXT,
ADD COLUMN "recordLabel" TEXT,
ADD COLUMN "producer" TEXT;

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "discNumber" INTEGER,
ADD COLUMN "composer" TEXT,
ADD COLUMN "featuredArtists" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "lyrics" TEXT;
