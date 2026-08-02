-- CreateEnum
CREATE TYPE "TelegramImportBatchStatus" AS ENUM ('enumerating', 'ready', 'importing', 'stopped', 'completed', 'completed_with_errors', 'error');

-- CreateEnum
CREATE TYPE "TelegramImportItemStatus" AS ENUM ('pending', 'selected', 'downloading', 'processing', 'uploading', 'saving', 'done', 'error', 'skipped_duplicate', 'cancelled');

-- CreateTable
CREATE TABLE "TelegramImportBatch" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "channelName" TEXT,
    "status" "TelegramImportBatchStatus" NOT NULL DEFAULT 'enumerating',
    "error" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "targetArtistId" TEXT,
    "existingAlbumTitlesSnapshot" JSONB,
    "allowDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "duplicateAlbumMap" JSONB,

    CONSTRAINT "TelegramImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "performer" TEXT,
    "albumTitle" TEXT,
    "position" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "status" "TelegramImportItemStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "trackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trackWasNew" BOOLEAN,
    "albumWasNew" BOOLEAN,

    CONSTRAINT "TelegramImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramImportBatch_createdBy_idx" ON "TelegramImportBatch"("createdBy");

-- CreateIndex
CREATE INDEX "TelegramImportItem_batchId_idx" ON "TelegramImportItem"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramImportItem_batchId_messageId_key" ON "TelegramImportItem"("batchId", "messageId");

-- AddForeignKey
ALTER TABLE "TelegramImportBatch" ADD CONSTRAINT "TelegramImportBatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramImportItem" ADD CONSTRAINT "TelegramImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TelegramImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
