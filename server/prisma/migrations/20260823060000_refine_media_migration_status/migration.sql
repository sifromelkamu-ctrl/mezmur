-- Additive/rename-only — safe against the 3,275 existing rows, all of which
-- are currently "pending" (untouched by either change below).
ALTER TYPE "MediaMigrationStatus" RENAME VALUE 'processing' TO 'transferring';
ALTER TYPE "MediaMigrationStatus" ADD VALUE 'retrying';
