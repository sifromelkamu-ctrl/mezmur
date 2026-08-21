-- CreateEnum
CREATE TYPE "SongSubmissionType" AS ENUM ('single', 'album');

-- CreateEnum
CREATE TYPE "SongSubmissionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "song_submissions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" "SongSubmissionType" NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistPhotoUrl" TEXT,
    "albumTitle" TEXT,
    "albumCoverUrl" TEXT,
    "status" "SongSubmissionStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdArtistId" TEXT,
    "createdAlbumId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_submission_tracks" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "artworkUrl" TEXT,
    "createdTrackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_submission_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "song_submissions_userId_idx" ON "song_submissions"("userId");

-- CreateIndex
CREATE INDEX "song_submissions_status_idx" ON "song_submissions"("status");

-- CreateIndex
CREATE INDEX "song_submission_tracks_submissionId_idx" ON "song_submission_tracks"("submissionId");

-- AddForeignKey
ALTER TABLE "song_submissions" ADD CONSTRAINT "song_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_submission_tracks" ADD CONSTRAINT "song_submission_tracks_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "song_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
