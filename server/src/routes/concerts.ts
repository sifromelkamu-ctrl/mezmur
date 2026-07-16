import { Router } from "express";
import { prisma } from "../prisma.js";
import { toAlbumDTO, toTrackDTO } from "./artists.js";

const router = Router();

// Concerts are a dedicated, admin-curated category — never regular albums/
// singles, never auto-derived. Under the hood a Concert Album is still an
// Album row (see Album.albumType in schema.prisma) and a standalone Concert
// Song is still a Track row (see Track.isConcertSong) — both chosen
// explicitly by an admin (at import time, or via each one's own edit form)
// rather than guessed. This endpoint merges both into one ordered feed
// (each item tagged `kind: "album" | "song"`) so Home's Concerts section can
// render one horizontal list — GET /api/albums, /api/singles, and
// /api/tracks never return either of these, and this route never returns
// anything else.
router.get("/", async (_req, res) => {
  const [albums, songs] = await Promise.all([
    prisma.album.findMany({
      where: { albumType: "live", artist: { ownerId: null } },
      include: { artist: true },
    }),
    prisma.track.findMany({
      where: {
        isConcertSong: true,
        albumId: null,
        // An unmatched Concert Song import has no artist link at all (see
        // youtube/pipeline.ts's findExistingArtist/findOrCreateArtist) —
        // still catalog content, never a user-owned one.
        OR: [{ artist: { ownerId: null } }, { artistId: null }],
      },
      include: { artist: true, album: true },
    }),
  ]);

  const items = [
    ...albums.map((a) => ({
      kind: "album" as const,
      createdAt: a.createdAt,
      item: { ...toAlbumDTO(a), artistName: a.artist.name },
    })),
    ...songs.map((t) => ({
      kind: "song" as const,
      createdAt: t.createdAt,
      item: toTrackDTO(t),
    })),
  ].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());

  res.json(items.map(({ kind, item }) => ({ ...item, kind })));
});

// GET /api/concerts/tracks - every track belonging to a Concert Album,
// flattened across albums. Concert Album tracks are excluded from
// GET /api/tracks (see routes/tracks.ts), so without this there's no way
// for a client to resolve a track id it only knows from a play log (e.g.
// Home's Continue Listening) back to a track if that track was played from
// inside a Concert Album rather than the standalone-Concert-Song feed above.
router.get("/tracks", async (_req, res) => {
  const tracks = await prisma.track.findMany({
    where: { album: { albumType: "live", artist: { ownerId: null } } },
    include: { artist: true, album: true },
  });
  res.json(tracks.map((t) => toTrackDTO(t)));
});

export default router;
