import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { uploadImageToStorage, upload } from "../upload.js";
import { toTrackDTO } from "./artists.js";

const router = Router();

async function canEditOwned(userId: string, ownerId: string | null): Promise<boolean> {
  if (ownerId) return ownerId === userId;
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  return profile?.role === "admin";
}

const PALETTE: [string, string][] = [
  ["#f2b705", "#c2410c"],
  ["#0ea5e9", "#1e3a8a"],
  ["#22c55e", "#065f46"],
  ["#ec4899", "#701a75"],
  ["#f97316", "#7c2d12"],
  ["#a855f7", "#312e81"],
  ["#14b8a6", "#134e4a"],
  ["#f43f5e", "#4c0519"],
];

function gradientForSeed(seed: string): [string, string] {
  let hash = 0;
  for (const ch of seed) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function toPlaylistDTO(playlist: {
  id: string;
  title: string;
  description: string | null;
  gradientFrom: string;
  gradientTo: string;
  coverUrl?: string | null;
  ownerId?: string | null;
  artworkFrame?: unknown;
}) {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description ?? "",
    gradient: [playlist.gradientFrom, playlist.gradientTo] as [string, string],
    coverUrl: playlist.coverUrl ?? undefined,
    ownerId: playlist.ownerId ?? null,
    artworkFrame: playlist.artworkFrame ?? undefined,
  };
}

// GET /api/playlists - catalog playlists (not user-owned)
router.get("/", async (_req, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { ownerId: null },
    orderBy: { createdAt: "asc" },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  res.json(
    playlists.map((p) => ({
      ...toPlaylistDTO(p),
      trackIds: p.tracks.map((pt) => pt.trackId),
    }))
  );
});

// GET /api/playlists/mine - current user's own playlists
router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { ownerId: req.userId },
    orderBy: { createdAt: "desc" },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  res.json(
    playlists.map((p) => ({
      ...toPlaylistDTO(p),
      trackIds: p.tracks.map((pt) => pt.trackId),
    }))
  );
});

const createPlaylistSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  // Admin-only, explicit opt-in: creates a catalog/"section" playlist
  // (ownerId: null) instead of one owned by the requesting user — the same
  // curated playlists Search's "Browse all" grid and Home surface to every
  // listener. Silently ignored (falls back to owned) for a non-admin, so a
  // regular user's own "Create playlist" flow can never accidentally post a
  // section-visible playlist.
  curated: z.boolean().optional(),
});

// POST /api/playlists - create a personalized playlist owned by the current
// user, or (admin + curated: true) a catalog "section" playlist
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createPlaylistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  let ownerId: string | null = req.userId!;
  if (parsed.data.curated) {
    const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
    if (profile?.role === "admin") ownerId = null;
  }
  const [gradientFrom, gradientTo] = gradientForSeed(parsed.data.title);
  const playlist = await prisma.playlist.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      gradientFrom,
      gradientTo,
      ownerId,
    },
  });
  res.status(201).json({ ...toPlaylistDTO(playlist), trackIds: [] });
});

// PATCH /api/playlists/:id/cover - upload/replace a playlist's cover image
router.patch("/:id/cover", requireAuth, upload.single("cover"), async (req: AuthedRequest, res) => {
  try {
    const playlist = await prisma.playlist.findUnique({ where: { id: String(req.params.id) } });
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }
    if (!(await canEditOwned(req.userId!, playlist.ownerId))) {
      res.status(403).json({ error: "You don't have permission to edit this playlist" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image uploaded" });
      return;
    }
    const coverUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype);
    const updated = await prisma.playlist.update({ where: { id: playlist.id }, data: { coverUrl } });
    res.json(toPlaylistDTO(updated));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

// DELETE /api/playlists/:id - remove a user-owned playlist
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: String(req.params.id) } });
  if (!playlist || playlist.ownerId !== req.userId) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }
  await prisma.playlist.delete({ where: { id: playlist.id } });
  res.status(204).end();
});

const addTrackSchema = z.object({
  trackId: z.string().min(1),
});

// POST /api/playlists/:id/tracks - add a track to a user-owned playlist, or
// (admin) a curated section playlist
router.post("/:id/tracks", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: String(req.params.id) },
    include: { tracks: true },
  });
  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, playlist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this playlist" });
    return;
  }
  const parsed = addTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const track = await prisma.track.findUnique({ where: { id: parsed.data.trackId } });
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  const nextPosition = playlist.tracks.length;
  await prisma.playlistTrack.upsert({
    where: { playlistId_trackId: { playlistId: playlist.id, trackId: track.id } },
    create: { playlistId: playlist.id, trackId: track.id, position: nextPosition },
    update: {},
  });
  res.status(201).json({ ok: true });
});

// DELETE /api/playlists/:id/tracks/:trackId - remove a track from a
// user-owned playlist, or (admin) a curated section playlist
router.delete("/:id/tracks/:trackId", requireAuth, async (req: AuthedRequest, res) => {
  const playlist = await prisma.playlist.findUnique({ where: { id: String(req.params.id) } });
  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, playlist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this playlist" });
    return;
  }
  await prisma.playlistTrack.deleteMany({
    where: { playlistId: playlist.id, trackId: String(req.params.trackId) },
  });
  res.status(204).end();
});

// GET /api/playlists/:id - single playlist with full track details
router.get("/:id", async (req, res) => {
  const playlist = await prisma.playlist.findUnique({
    where: { id: String(req.params.id) },
    include: {
      tracks: {
        orderBy: { position: "asc" },
        include: { track: { include: { artist: true, album: true } } },
      },
    },
  });
  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }
  res.json({
    ...toPlaylistDTO(playlist),
    tracks: playlist.tracks.map((pt) => toTrackDTO(pt.track)),
  });
});

export default router;
