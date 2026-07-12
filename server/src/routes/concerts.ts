import { Router } from "express";
import { prisma } from "../prisma.js";
import { toAlbumDTO } from "./artists.js";

const router = Router();

// Concerts are a dedicated, admin-curated category — never regular albums,
// never auto-derived. Under the hood a "concert" is still an Album row (see
// Album.albumType in schema.prisma), chosen explicitly by an admin at
// creation time (or via the album's own edit form) rather than guessed —
// but this endpoint is what makes it a genuinely separate category from a
// consumer's point of view: GET /api/albums never returns these, and this
// route never returns anything else.
router.get("/", async (_req, res) => {
  const concerts = await prisma.album.findMany({
    where: { albumType: "live", artist: { ownerId: null } },
    include: { artist: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(concerts.map((c) => ({ ...toAlbumDTO(c), artistName: c.artist.name })));
});

export default router;
