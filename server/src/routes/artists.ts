import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { uploadImageToStorage, upload } from "../upload.js";

const router = Router();

// A user can edit a resource they own; for catalog (unowned) resources, only
// admins may edit — this replaces the old behavior where any logged-in user
// could silently overwrite shared catalog images.
async function canEditOwned(userId: string, ownerId: string | null): Promise<boolean> {
  if (ownerId) return ownerId === userId;
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  return profile?.role === "admin";
}

function toArtistDTO(artist: {
  id: string;
  name: string;
  bio: string | null;
  gradientFrom: string;
  gradientTo: string;
  monthlyListeners: number;
  isGroup: boolean;
  photoUrl: string | null;
  ownerId: string | null;
  artworkFrame?: unknown;
  spotifyId?: string | null;
  spotifyLastSyncedAt?: Date | null;
  spotifyLastSyncError?: string | null;
}) {
  return {
    id: artist.id,
    name: artist.name,
    bio: artist.bio ?? "",
    gradient: [artist.gradientFrom, artist.gradientTo] as [string, string],
    monthlyListeners: artist.monthlyListeners,
    isGroup: artist.isGroup,
    photoUrl: artist.photoUrl ?? undefined,
    ownerId: artist.ownerId,
    artworkFrame: artist.artworkFrame ?? undefined,
    spotifyArtistId: artist.spotifyId ?? undefined,
    spotifyArtistUrl: artist.spotifyId ? `https://open.spotify.com/artist/${artist.spotifyId}` : undefined,
    spotifyLastSyncedAt: artist.spotifyLastSyncedAt ? artist.spotifyLastSyncedAt.toISOString() : undefined,
    spotifyLastSyncError: artist.spotifyLastSyncError ?? undefined,
  };
}

function toAlbumDTO(album: {
  id: string;
  title: string;
  year: number | null;
  gradientFrom: string | null;
  gradientTo: string | null;
  coverUrl?: string | null;
  description?: string | null;
  albumType?: string;
  releaseDate?: Date | null;
  genre?: string | null;
  artistId: string;
  tracks?: { duration: number }[];
  _count?: { tracks: number };
  artworkFrame?: unknown;
  createdAt?: Date;
}) {
  const trackCount = album._count?.tracks ?? album.tracks?.length;
  const totalDuration = album.tracks?.reduce((sum, t) => sum + t.duration, 0);
  return {
    id: album.id,
    title: album.title,
    year: album.year ?? undefined,
    gradient: [album.gradientFrom ?? "#333333", album.gradientTo ?? "#111111"] as [string, string],
    coverUrl: album.coverUrl ?? undefined,
    description: album.description ?? undefined,
    albumType: album.albumType ?? "album",
    releaseDate: album.releaseDate ? album.releaseDate.toISOString().slice(0, 10) : undefined,
    genre: album.genre ?? undefined,
    artistId: album.artistId,
    trackCount,
    totalDuration,
    artworkFrame: album.artworkFrame ?? undefined,
    // When this catalog item was actually imported/added — what "New
    // Releases" sorts by (Home.tsx), as opposed to releaseDate/year, which
    // is the content's own nominal release year and says nothing about when
    // it was posted to Mezmur.
    createdAt: album.createdAt ? album.createdAt.toISOString() : undefined,
  };
}

function toTrackDTO(track: {
  id: string;
  title: string;
  duration: number;
  language: string | null;
  genre?: string | null;
  audioUrl?: string | null;
  coverUrl?: string | null;
  moods?: string[];
  playCount?: number;
  trackNumber?: number | null;
  discNumber?: number | null;
  artistId: string | null;
  // Plain-text fallback for artistName when this Single has no linked Artist
  // (see Track.artistNameOverride) — never read when artist is set.
  artistNameOverride?: string | null;
  albumId: string | null;
  artist?: { name: string; gradientFrom: string; gradientTo: string } | null;
  album?: {
    title: string;
    gradientFrom: string | null;
    gradientTo: string | null;
    coverUrl?: string | null;
    artworkFrame?: unknown;
  } | null;
  artworkFrame?: unknown;
}) {
  const gradient: [string, string] = track.album?.gradientFrom
    ? [track.album.gradientFrom, track.album.gradientTo ?? "#111111"]
    : [track.artist?.gradientFrom ?? "#333333", track.artist?.gradientTo ?? "#111111"];
  // Album Artwork Is Master Artwork: a track that belongs to an album always
  // shows that album's cover/frame, live, never its own — so there's exactly
  // one place (the Album page) artwork is ever edited for grouped tracks,
  // and every surface (mini player, queue, library, search, playlists...)
  // reflects a change the instant the album's own row is updated, with no
  // propagation step. Standalone singles (no albumId) keep using their own.
  const coverUrl = track.albumId ? track.album?.coverUrl : track.coverUrl;
  const artworkFrame = track.albumId ? track.album?.artworkFrame : track.artworkFrame;
  return {
    id: track.id,
    title: track.title,
    duration: track.duration,
    language: track.language,
    genre: track.genre ?? undefined,
    audioUrl: track.audioUrl ?? undefined,
    coverUrl: coverUrl ?? undefined,
    moods: track.moods ?? [],
    playCount: track.playCount ?? 0,
    trackNumber: track.trackNumber ?? undefined,
    discNumber: track.discNumber ?? undefined,
    artistId: track.artistId,
    // Linked artist wins when present; otherwise fall back to the per-track
    // override (unassigned Single imports — see Track.artistNameOverride).
    artistName: track.artist?.name ?? track.artistNameOverride ?? undefined,
    albumId: track.albumId,
    albumTitle: track.album?.title,
    gradient,
    artworkFrame: artworkFrame ?? undefined,
  };
}

// GET /api/artists - catalog artists (not user-owned)
router.get("/", async (_req, res) => {
  const artists = await prisma.artist.findMany({
    where: { ownerId: null },
    orderBy: { name: "asc" },
  });
  res.json(artists.map(toArtistDTO));
});

// GET /api/artists/mine - current user's own artists
router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const artists = await prisma.artist.findMany({
    where: { ownerId: req.userId },
    include: { albums: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    artists.map((a) => ({
      ...toArtistDTO(a),
      albums: a.albums.map(toAlbumDTO),
    }))
  );
});

// GET /api/artists/:id - single artist with albums (grouped by type,
// track-order preserved within each) and a short "popular" list of top
// tracks. The full song list lives behind each album, not flattened here.
router.get("/:id", optionalAuth, async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { id: String(req.params.id) },
    include: {
      // Concerts are a completely separate content type — never merged into
      // an artist's own discography or Popular Songs, even though a
      // concert's tracks/album still technically belong to this artist.
      albums: {
        where: { albumType: { not: "live" } },
        include: { tracks: { select: { duration: true } } },
        orderBy: { year: "desc" },
      },
      tracks: {
        where: { NOT: { album: { albumType: "live" } } },
        include: { album: true },
        orderBy: { playCount: "desc" },
        take: 10,
      },
    },
  });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  res.json({
    ...toArtistDTO(artist),
    albums: artist.albums.map(toAlbumDTO),
    topTracks: artist.tracks.map((t) => toTrackDTO({ ...t, artist })),
  });
});

const createArtistSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// POST /api/artists - create a user-owned artist
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const palette: [string, string][] = [
    ["#f2b705", "#c2410c"],
    ["#0ea5e9", "#1e3a8a"],
    ["#22c55e", "#065f46"],
    ["#ec4899", "#701a75"],
    ["#f97316", "#7c2d12"],
    ["#a855f7", "#312e81"],
    ["#14b8a6", "#134e4a"],
    ["#f43f5e", "#4c0519"],
  ];
  let hash = 0;
  for (const ch of parsed.data.name) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const [gradientFrom, gradientTo] = palette[hash % palette.length];

  const artist = await prisma.artist.create({
    data: {
      name: parsed.data.name,
      gradientFrom,
      gradientTo,
      ownerId: req.userId!,
    },
  });
  res.status(201).json(toArtistDTO(artist));
});

// PATCH /api/artists/:id/photo - upload/replace an artist's photo
router.patch("/:id/photo", requireAuth, upload.single("photo"), async (req: AuthedRequest, res) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
    if (!artist) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }
    if (!(await canEditOwned(req.userId!, artist.ownerId))) {
      res.status(403).json({ error: "You don't have permission to edit this artist" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image uploaded" });
      return;
    }
    const photoUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype);
    const updated = await prisma.artist.update({ where: { id: artist.id }, data: { photoUrl } });
    res.json(toArtistDTO(updated));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

const updateArtistSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  bio: z.string().trim().max(4000).optional(),
});

// PATCH /api/artists/:id - metadata editor: rename, edit biography.
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, artist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this artist" });
    return;
  }
  const parsed = updateArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const updated = await prisma.artist.update({ where: { id: artist.id }, data: parsed.data });
  res.json(toArtistDTO(updated));
});

// DELETE /api/artists/:id/photo - remove an artist's photo (falls back to the gradient placeholder)
router.delete("/:id/photo", requireAuth, async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, artist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this artist" });
    return;
  }
  const updated = await prisma.artist.update({ where: { id: artist.id }, data: { photoUrl: null } });
  res.json(toArtistDTO(updated));
});

// DELETE /api/artists/:id - remove a user-owned artist
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist || artist.ownerId !== req.userId) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  await prisma.artist.delete({ where: { id: artist.id } });
  res.status(204).end();
});

const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

// POST /api/artists/:id/albums - add an album under a user-owned artist
router.post("/:id/albums", requireAuth, async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist || artist.ownerId !== req.userId) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  const parsed = createAlbumSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const album = await prisma.album.create({
    data: {
      title: parsed.data.title,
      artistId: artist.id,
      gradientFrom: artist.gradientFrom,
      gradientTo: artist.gradientTo,
    },
  });
  res.status(201).json(toAlbumDTO(album));
});

export default router;
export { toAlbumDTO, toArtistDTO, toTrackDTO };
