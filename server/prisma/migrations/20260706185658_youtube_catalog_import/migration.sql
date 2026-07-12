-- CreateEnum
CREATE TYPE "YoutubeImportBatchStatus" AS ENUM ('enumerating', 'ready', 'importing', 'completed', 'completed_with_errors', 'error');

-- CreateEnum
CREATE TYPE "YoutubeImportItemStatus" AS ENUM ('pending', 'selected', 'downloading', 'processing', 'uploading', 'saving', 'done', 'error', 'skipped_duplicate');

-- CreateTable
CREATE TABLE "YoutubeImportBatch" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "channelName" TEXT,
    "status" "YoutubeImportBatchStatus" NOT NULL DEFAULT 'enumerating',
    "error" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "albumTitle" TEXT,
    "position" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "status" "YoutubeImportItemStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "trackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YoutubeImportBatch_createdBy_idx" ON "YoutubeImportBatch"("createdBy");

-- CreateIndex
CREATE INDEX "YoutubeImportItem_batchId_idx" ON "YoutubeImportItem"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeImportItem_batchId_videoId_key" ON "YoutubeImportItem"("batchId", "videoId");

-- AddForeignKey
ALTER TABLE "YoutubeImportBatch" ADD CONSTRAINT "YoutubeImportBatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeImportItem" ADD CONSTRAINT "YoutubeImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "YoutubeImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
