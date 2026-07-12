import { Router } from "express";
import { prisma } from "../prisma.js";
import { toAlbumDTO, toArtistDTO, toTrackDTO } from "./artists.js";

const router = Router();

// GET /api/search?q=... - search tracks, artists, albums, playlists by name
router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ tracks: [], artists: [], albums: [], playlists: [] });
    return;
  }

  const [tracks, artists, albums, playlists] = await Promise.all([
    prisma.track.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      include: { artist: true, album: true },
      take: 25,
    }),
    prisma.artist.findMany({
      where: { name: { contains: q, mode: "insensitive" }, ownerId: null },
      take: 25,
    }),
    prisma.album.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      include: { artist: true },
      take: 25,
    }),
    prisma.playlist.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      take: 25,
    }),
  ]);

  res.json({
    tracks: tracks.map((t) => toTrackDTO(t)),
    artists: artists.map(toArtistDTO),
    albums: albums.map((a) => ({ ...toAlbumDTO(a), artistName: a.artist.name })),
    playlists: playlists.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      gradient: [p.gradientFrom, p.gradientTo],
    })),
  });
});

export default router;
