-- CreateEnum
CREATE TYPE "AlbumType" AS ENUM ('album', 'ep', 'single', 'live', 'compilation');

-- AlterTable
ALTER TABLE "Album" ADD COLUMN "description" TEXT,
ADD COLUMN "albumType" "AlbumType" NOT NULL DEFAULT 'album';
