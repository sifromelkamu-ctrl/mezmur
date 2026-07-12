-- Re-adds a nullable lyrics column to Track for the new admin Library
-- Management "Edit Song" feature. Purely additive.

-- AlterTable
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "lyrics" TEXT;
