-- AlterTable
ALTER TABLE "Track" ALTER COLUMN "artistId" DROP NOT NULL;
ALTER TABLE "Track" ADD COLUMN "artistNameOverride" TEXT;
