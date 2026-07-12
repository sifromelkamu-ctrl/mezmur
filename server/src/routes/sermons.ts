import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

function toSermonDTO(sermon: {
  id: string;
  title: string;
  speaker: string;
  description: string | null;
  duration: number;
  gradientFrom: string;
  gradientTo: string;
}) {
  return {
    id: sermon.id,
    title: sermon.title,
    speaker: sermon.speaker,
    description: sermon.description ?? "",
    duration: sermon.duration,
    gradient: [sermon.gradientFrom, sermon.gradientTo] as [string, string],
  };
}

// GET /api/sermons - all sermons
router.get("/", async (_req, res) => {
  const sermons = await prisma.sermon.findMany({ orderBy: { createdAt: "asc" } });
  res.json(sermons.map(toSermonDTO));
});

// GET /api/sermons/:id - single sermon
router.get("/:id", async (req, res) => {
  const sermon = await prisma.sermon.findUnique({ where: { id: String(req.params.id) } });
  if (!sermon) {
    res.status(404).json({ error: "Sermon not found" });
    return;
  }
  res.json(toSermonDTO(sermon));
});

export default router;
