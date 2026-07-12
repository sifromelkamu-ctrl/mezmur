import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

function toPodcastDTO(podcast: {
  id: string;
  title: string;
  host: string;
  description: string | null;
  duration: number;
  gradientFrom: string;
  gradientTo: string;
}) {
  return {
    id: podcast.id,
    title: podcast.title,
    host: podcast.host,
    description: podcast.description ?? "",
    duration: podcast.duration,
    gradient: [podcast.gradientFrom, podcast.gradientTo] as [string, string],
  };
}

// GET /api/podcasts - all podcasts
router.get("/", async (_req, res) => {
  const podcasts = await prisma.podcast.findMany({ orderBy: { createdAt: "asc" } });
  res.json(podcasts.map(toPodcastDTO));
});

// GET /api/podcasts/:id - single podcast
router.get("/:id", async (req, res) => {
  const podcast = await prisma.podcast.findUnique({ where: { id: String(req.params.id) } });
  if (!podcast) {
    res.status(404).json({ error: "Podcast not found" });
    return;
  }
  res.json(toPodcastDTO(podcast));
});

export default router;
