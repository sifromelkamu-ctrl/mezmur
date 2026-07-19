import { Router } from "express";
import { bibleAudioConfigured, getAudioStream } from "../bibleAudio.js";

const router = Router();

// GET /api/bible-audio/:slug/:chapter — proxies a stream URL from Faith
// Comes By Hearing's Digital Bible Platform for the given book/chapter.
// The API key lives server-side only (see bibleAudio.ts); the client only
// ever receives the resulting stream URL, never the key itself.
router.get("/:slug/:chapter", async (req, res) => {
  if (!bibleAudioConfigured) {
    res.status(503).json({ error: "Audio Bible is not configured on this server" });
    return;
  }
  const chapter = Number(req.params.chapter);
  if (!Number.isInteger(chapter) || chapter < 1) {
    res.status(400).json({ error: "Invalid chapter" });
    return;
  }
  const stream = await getAudioStream(req.params.slug, chapter);
  if (!stream) {
    res.status(404).json({ error: "Audio not available for this chapter" });
    return;
  }
  res.json(stream);
});

export default router;
