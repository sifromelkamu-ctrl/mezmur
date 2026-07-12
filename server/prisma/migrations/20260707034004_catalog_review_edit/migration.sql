-- CreateEnum
CREATE TYPE "AlbumType" AS ENUM ('album', 'ep', 'single', 'live', 'compilation');

-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "description" TEXT,
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "genre" TEXT,
ADD COLUMN     "albumType" "AlbumType" NOT NULL DEFAULT 'album';

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "discNumber" INTEGER,
ADD COLUMN     "lyrics" TEXT,
ADD COLUMN     "composer" TEXT,
ADD COLUMN     "featuredArtists" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "explicit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "YoutubeImportBatch" ADD COLUMN     "artistDraft" JSONB,
ADD COLUMN     "albumDrafts" JSONB;

-- AlterTable
ALTER TABLE "YoutubeImportItem" ADD COLUMN     "overrides" JSONB;
