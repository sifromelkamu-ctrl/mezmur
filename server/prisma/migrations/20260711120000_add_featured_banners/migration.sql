-- CreateEnum
CREATE TYPE "FeaturedBannerEntityType" AS ENUM ('album', 'single', 'artist', 'playlist', 'concert');

-- CreateTable
CREATE TABLE "featured_banners" (
    "id" TEXT NOT NULL,
    "entityType" "FeaturedBannerEntityType" NOT NULL DEFAULT 'album',
    "entityId" TEXT NOT NULL,
    "bannerImageUrl" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "badgeText" TEXT,
    "buttonText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "featured_banners_entityType_entityId_idx" ON "featured_banners"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "featured_banners_enabled_displayOrder_idx" ON "featured_banners"("enabled", "displayOrder");
