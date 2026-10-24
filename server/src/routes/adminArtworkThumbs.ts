import { Router } from "express";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { backfillState, runArtworkThumbBackfill } from "../storage/artworkThumbBackfill.js";

const router = Router();

// Settings > Admin: one-off backfill of the small artwork thumbnail
// derivative (see upload.ts's generateThumbnail / CoverArt.tsx's
// toThumbUrl) for every piece of artwork uploaded before that feature
// existed. Temporary admin tooling — safe to remove once the catalog has
// been backfilled once, since every new upload generates its own thumb
// automatically from here on.
router.use(isAdmin);

// POST /api/admin/artwork-thumbs/backfill — starts the background job and
// returns immediately; it keeps running on the server regardless of
// whether the admin's browser stays open. Poll /backfill/status for
// progress. Safe to call again after an interruption — already-generated
// thumbs are skipped (see runArtworkThumbBackfill's own doc).
router.post("/backfill", async (_req: AuthedRequest, res) => {
  if (backfillState.running) {
    res.status(409).json({ error: "A backfill is already running" });
    return;
  }
  runArtworkThumbBackfill().catch((err) => {
    console.error("[artwork-thumbs] backfill failed:", err);
  });
  res.status(202).json({ started: true });
});

router.get("/backfill/status", async (_req: AuthedRequest, res) => {
  res.json(backfillState);
});

export default router;
