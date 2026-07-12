import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { uploadImageToStorage, upload } from "../upload.js";
import { toAlbumDTO, toTrackDTO } from "./artists.js";

const router = Router();

async function canEditOwned(userId: string, ownerId: string | null): Promise<boolean> {
  if (ownerId) return ownerId === userId;
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  return profile?.role === "admin";
}

// GET /api/albums - catalog albums (belonging to non-user-owned artists)
router.get("/", async (_req, res) => {
  const albums = await prisma.album.findMany({
    where: { artist: { ownerId: null } },
    include: { artist: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(albums.map((a) => ({ ...toAlbumDTO(a), artistName: a.artist.name })));
});

// GET /api/albums/:id - single album with tracks in track order
router.get("/:id", async (req, res) => {
  const album = await prisma.album.findUnique({
    where: { id: String(req.params.id) },
    include: { tracks: { orderBy: [{ trackNumber: "asc" }, { createdAt: "asc" }] }, artist: true },
  });
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  res.json({
    ...toAlbumDTO(album),
    artistName: album.artist.name,
    tracks: album.tracks.map((t) => toTrackDTO({ ...t, artist: album.artist, album })),
  });
});

// PATCH /api/albums/:id/cover - upload/replace an album's cover image
router.patch("/:id/cover", requireAuth, upload.single("cover"), async (req: AuthedRequest, res) => {
  try {
    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      include: { artist: true },
    });
    if (!album) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    if (!(await canEditOwned(req.userId!, album.artist.ownerId))) {
      res.status(403).json({ error: "You don't have permission to edit this album" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image uploaded" });
      return;
    }
    const coverUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype);
    // A new image entirely — any saved crop was framed against the old
    // picture, so it's cleared here. Every track under this album picks up
    // the change instantly (toTrackDTO always reads it live from the
    // album), so there's nothing to propagate onto track rows.
    const updated = await prisma.album.update({
      where: { id: album.id },
      data: { coverUrl, artworkFrame: Prisma.JsonNull },
    });
    res.json(toAlbumDTO(updated));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

const updateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  albumType: z.enum(["album", "ep", "single", "live", "compilation"]).optional(),
  releaseDate: z.string().trim().optional(),
  genre: z.string().trim().max(60).optional(),
});

// PATCH /api/albums/:id - metadata editor: rename, description, type,
// release date, and genre.
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({ where: { id: String(req.params.id) }, include: { artist: true } });
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, album.artist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this album" });
    return;
  }
  const parsed = updateAlbumSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { releaseDate, ...rest } = parsed.data;
  const parsedDate = releaseDate ? new Date(releaseDate) : undefined;
  if (releaseDate && parsedDate && Number.isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: "Invalid release date" });
    return;
  }
  const updated = await prisma.album.update({
    where: { id: album.id },
    data: { ...rest, ...(parsedDate ? { releaseDate: parsedDate } : {}) },
  });
  res.json(toAlbumDTO(updated));
});

// DELETE /api/albums/:id/cover - remove an album's artwork (falls back to the gradient placeholder)
router.delete("/:id/cover", requireAuth, async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({ where: { id: String(req.params.id) }, include: { artist: true } });
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, album.artist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this album" });
    return;
  }
  const updated = await prisma.album.update({ where: { id: album.id }, data: { coverUrl: null } });
  res.json(toAlbumDTO(updated));
});

const reorderSchema = z.object({ trackIds: z.array(z.string()).min(1) });

// POST /api/albums/:id/reorder - drag-and-drop track reordering: sets
// trackNumber sequentially from the given id order.
router.post("/:id/reorder", requireAuth, async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({ where: { id: String(req.params.id) }, include: { artist: true } });
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, album.artist.ownerId))) {
    res.status(403).json({ error: "You don't have permission to edit this album" });
    return;
  }
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const tracks = await prisma.track.findMany({ where: { id: { in: parsed.data.trackIds }, albumId: album.id } });
  if (tracks.length !== parsed.data.trackIds.length) {
    res.status(400).json({ error: "One or more tracks don't belong to this album" });
    return;
  }
  await prisma.$transaction(
    parsed.data.trackIds.map((id, index) => prisma.track.update({ where: { id }, data: { trackNumber: index + 1 } }))
  );
  res.status(204).end();
});

// DELETE /api/albums/:id - remove an album from a user-owned artist
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({
    where: { id: String(req.params.id) },
    include: { artist: true },
  });
  if (!album || album.artist.ownerId !== req.userId) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  await prisma.album.delete({ where: { id: album.id } });
  res.status(204).end();
});

export default router;
