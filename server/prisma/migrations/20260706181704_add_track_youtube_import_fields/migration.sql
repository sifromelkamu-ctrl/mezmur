-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "waveform" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Track_sourceId_key" ON "Track"("sourceId");
