-- Removes credits/lyrics fields from the catalog metadata editor scope,
-- keeping only generic descriptive fields (description, release date,
-- genre, album type, disc number).

-- AlterTable
ALTER TABLE "Album" DROP COLUMN IF EXISTS "copyright",
DROP COLUMN IF EXISTS "recordLabel",
DROP COLUMN IF EXISTS "producer";

-- AlterTable
ALTER TABLE "Track" DROP COLUMN IF EXISTS "composer",
DROP COLUMN IF EXISTS "featuredArtists",
DROP COLUMN IF EXISTS "lyrics";
