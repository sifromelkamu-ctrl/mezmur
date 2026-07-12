-- Artist: additional profile metadata
ALTER TABLE "Artist" ADD COLUMN "country" TEXT;
ALTER TABLE "Artist" ADD COLUMN "language" TEXT;
ALTER TABLE "Artist" ADD COLUMN "website" TEXT;
ALTER TABLE "Artist" ADD COLUMN "socialLinks" JSONB;

-- Album: additional release metadata
ALTER TABLE "Album" ADD COLUMN "language" TEXT;
ALTER TABLE "Album" ADD COLUMN "copyright" TEXT;
ALTER TABLE "Album" ADD COLUMN "recordLabel" TEXT;
ALTER TABLE "Album" ADD COLUMN "producer" TEXT;

-- Track: additional credit metadata
ALTER TABLE "Track" ADD COLUMN "lyricist" TEXT;
ALTER TABLE "Track" ADD COLUMN "isrc" TEXT;
