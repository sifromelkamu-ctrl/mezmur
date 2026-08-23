-- AlterTable: nullable storage-key columns, existing audioUrl/coverUrl/photoUrl
-- columns are untouched and stay authoritative for every existing row.
ALTER TABLE "Artist" ADD COLUMN "photoStorageKey" TEXT;
ALTER TABLE "Album" ADD COLUMN "coverStorageKey" TEXT;
ALTER TABLE "Track" ADD COLUMN "audioStorageKey" TEXT;
ALTER TABLE "Track" ADD COLUMN "coverStorageKey" TEXT;
ALTER TABLE "Playlist" ADD COLUMN "coverStorageKey" TEXT;

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('track_audio', 'track_cover', 'album_cover', 'artist_photo', 'playlist_cover');

-- CreateEnum
CREATE TYPE "MediaMigrationStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped', 'verified');

-- CreateTable
CREATE TABLE "media_migration_jobs" (
    "id" TEXT NOT NULL,
    "mediaKind" "MediaKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "status" "MediaMigrationStatus" NOT NULL DEFAULT 'pending',
    "fileSize" INTEGER,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "migratedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_migration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_migration_jobs_mediaKind_entityId_key" ON "media_migration_jobs"("mediaKind", "entityId");

-- CreateIndex
CREATE INDEX "media_migration_jobs_status_idx" ON "media_migration_jobs"("status");
