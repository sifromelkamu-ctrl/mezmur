-- Removes schema additions from an abandoned "catalog metadata editor"
-- feature build that was never wired to any working code path (paused
-- mid-implementation) — none of these columns are read or written by any
-- production feature currently in use.

-- AlterTable
ALTER TABLE "Artist" DROP COLUMN IF EXISTS "country",
DROP COLUMN IF EXISTS "language",
DROP COLUMN IF EXISTS "website",
DROP COLUMN IF EXISTS "socialLinks";

-- AlterTable
ALTER TABLE "Album" DROP COLUMN IF EXISTS "description",
DROP COLUMN IF EXISTS "releaseDate",
DROP COLUMN IF EXISTS "genre",
DROP COLUMN IF EXISTS "albumType",
DROP COLUMN IF EXISTS "language",
DROP COLUMN IF EXISTS "copyright",
DROP COLUMN IF EXISTS "recordLabel",
DROP COLUMN IF EXISTS "producer";

-- AlterTable
ALTER TABLE "Track" DROP COLUMN IF EXISTS "discNumber",
DROP COLUMN IF EXISTS "lyrics",
DROP COLUMN IF EXISTS "composer",
DROP COLUMN IF EXISTS "lyricist",
DROP COLUMN IF EXISTS "isrc",
DROP COLUMN IF EXISTS "featuredArtists",
DROP COLUMN IF EXISTS "explicit";

-- AlterTable
ALTER TABLE "YoutubeImportBatch" DROP COLUMN IF EXISTS "artistDraft",
DROP COLUMN IF EXISTS "albumDrafts";

-- AlterTable
ALTER TABLE "YoutubeImportItem" DROP COLUMN IF EXISTS "overrides";

-- DropEnum
DROP TYPE IF EXISTS "AlbumType";
