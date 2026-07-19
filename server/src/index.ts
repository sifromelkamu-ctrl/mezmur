import "dotenv/config";
import cors from "cors";
import express from "express";
import adminRouter from "./routes/admin.js";
import adminFeaturedBannersRouter from "./routes/adminFeaturedBanners.js";
import adminLibraryRouter from "./routes/adminLibrary.js";
import albumsRouter from "./routes/albums.js";
import artistsRouter from "./routes/artists.js";
import authRouter from "./routes/auth.js";
import bibleAudioRouter from "./routes/bibleAudio.js";
import concertsRouter from "./routes/concerts.js";
import featuredBannersRouter from "./routes/featuredBanners.js";
import playlistsRouter from "./routes/playlists.js";
import podcastsRouter from "./routes/podcasts.js";
import pushRouter from "./routes/push.js";
import searchRouter from "./routes/search.js";
import sermonsRouter from "./routes/sermons.js";
import singlesRouter from "./routes/singles.js";
import tracksRouter from "./routes/tracks.js";
import youtubeImportRouter from "./routes/youtubeImport.js";
import { resumeAllInterrupted } from "./youtube/catalogWorker.js";
import { startDailyVersePushSchedule } from "./jobs/dailyVerse.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/concerts", concertsRouter);
app.use("/api/singles", singlesRouter);
app.use("/api/playlists", playlistsRouter);
app.use("/api/search", searchRouter);
app.use("/api/tracks", tracksRouter);
app.use("/api/sermons", sermonsRouter);
app.use("/api/podcasts", podcastsRouter);
app.use("/api/push", pushRouter);
app.use("/api/bible-audio", bibleAudioRouter);
app.use("/api/featured-banners", featuredBannersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/library", adminLibraryRouter);
app.use("/api/admin/featured-banners", adminFeaturedBannersRouter);
app.use("/api/admin/youtube-import", youtubeImportRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Mezmur API listening on http://localhost:${port}`);
});

// Picks back up any catalog import batches left "importing" when the
// process last exited, so a server restart doesn't strand them mid-queue.
resumeAllInterrupted().catch((err) => {
  console.error("Failed to resume interrupted YouTube catalog imports:", err);
});

startDailyVersePushSchedule();
