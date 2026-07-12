import { Router } from "express";
import { prisma } from "../prisma.js";
import { toTrackDTO } from "./artists.js";

const router = Router();

// Singles are a dedicated category too — but deliberately NOT just "any
// track with no album." A track can end up without an album for reasons
// that have nothing to do with being imported as a single (an old import
// from before this flag existed, its album later deleted, a manual bulk
// upload with "No album" chosen, ...), so this is gated on the explicit
// isSingle flag, set only when "Import from YouTube" has the "Single"
// destination chosen (see routes/youtubeImport.ts) — the same
// deliberate-tag pattern Concert Albums already use. GET /api/tracks still
// returns every track (search/playback/library are unaffected either way).
router.get("/", async (_req, res) => {
  const singles = await prisma.track.findMany({
    where: {
      // An unmatched Single import has no artist link at all (see
      // youtube/pipeline.ts's findExistingArtist) — that's still catalog
      // content, never a user-owned one, so it must count as
      // "non-user-owned" here just like a linked artist with ownerId: null.
      OR: [{ artist: { ownerId: null } }, { artistId: null }],
      albumId: null,
      isSingle: true,
    },
    include: { artist: true, album: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(singles.map((t) => toTrackDTO(t)));
});

export default router;
