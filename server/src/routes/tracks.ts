import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { toTrackDTO } from "./artists.js";

const router = Router();

async function canEditOwned(userId: string, ownerId: string | null): Promise<boolean> {
  if (ownerId) return ownerId === userId;
  const profile = await prisma.profile.findUnique({ where: { id: userId } });
  return profile?.role === "admin";
}

// GET /api/tracks - catalog tracks (belonging to non-user-owned artists),
// optionally filtered by ?mood=, ?language=, or ?era=classic|new
router.get("/", async (req, res) => {
  const mood = typeof req.query.mood === "string" ? req.query.mood : undefined;
  const language = typeof req.query.language === "string" ? req.query.language : undefined;
  const era = typeof req.query.era === "string" ? req.query.era : undefined;
  const ERA_CUTOFF_YEAR = 2023;
  // "new" means newly posted to Mezmur (sorted by createdAt), not a
  // manually-curated content-year cutoff — an old recording imported today
  // still counts as a new release. "classic" is unaffected, still a
  // genuine content-year cutoff for browsing older catalog.
  const NEW_RELEASES_LIMIT = 30;

  const tracks = await prisma.track.findMany({
    where: {
      // A track with no artist link at all (an unmatched Single import, see
      // youtube/pipeline.ts) has no owner concept either — it can only ever
      // be catalog content, so it counts as "non-user-owned" here too.
      OR: [{ artist: { ownerId: null } }, { artistId: null }],
      ...(mood ? { moods: { has: mood } } : {}),
      ...(language ? { language: { equals: language, mode: "insensitive" } } : {}),
      ...(era === "classic" ? { album: { year: { lt: ERA_CUTOFF_YEAR } } } : {}),
    },
    include: { artist: true, album: true },
    orderBy: { createdAt: era === "new" ? "desc" : "asc" },
    ...(era === "new" ? { take: NEW_RELEASES_LIMIT } : {}),
  });
  res.json(tracks.map((t) => toTrackDTO(t)));
});

// GET /api/tracks/trending - most played tracks across all users
router.get("/trending", async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 12);
  const tracks = await prisma.track.findMany({
    where: { OR: [{ artist: { ownerId: null } }, { artistId: null }] },
    include: { artist: true, album: true },
    orderBy: { playCount: "desc" },
    take: limit,
  });
  res.json(tracks.map((t) => toTrackDTO(t)));
});

const updateTrackSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  trackNumber: z.number().int().positive().nullable().optional(),
  discNumber: z.number().int().positive().nullable().optional(),
  genre: z.string().trim().max(60).optional(),
  language: z.string().trim().max(60).optional(),
  albumId: z.string().nullable().optional(),
});

// PATCH /api/tracks/:id - metadata editor: rename, track/disc number, genre,
// language, and moving a track to a different album.
router.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({ where: { id: String(req.params.id) }, include: { artist: true } });
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  if (!(await canEditOwned(req.userId!, track.artist?.ownerId ?? null))) {
    res.status(403).json({ error: "You don't have permission to edit this track" });
    return;
  }
  const parsed = updateTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  if (parsed.data.albumId) {
    const album = await prisma.album.findUnique({ where: { id: parsed.data.albumId } });
    if (!album || album.artistId !== track.artistId) {
      res.status(400).json({ error: "That album doesn't belong to this artist" });
      return;
    }
  }
  const updated = await prisma.track.update({
    where: { id: track.id },
    data: parsed.data,
    include: { artist: true, album: true },
  });
  res.json(toTrackDTO(updated));
});

// POST /api/tracks/:id/play - record a play (increments the global play count)
router.post("/:id/play", async (req, res) => {
  try {
    await prisma.track.update({
      where: { id: String(req.params.id) },
      data: { playCount: { increment: 1 } },
    });
  } catch {
    // track doesn't exist (e.g. a sermon/podcast pseudo-track) - ignore silently
  }
  res.status(204).end();
});

export default router;
