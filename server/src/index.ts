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
import stripeWebhookRouter from "./routes/stripeWebhook.js";
import subscriptionRouter from "./routes/subscription.js";
import telegramImportRouter from "./routes/telegramImport.js";
import tracksRouter from "./routes/tracks.js";
import youtubeImportRouter from "./routes/youtubeImport.js";
import { resumeAllInterrupted } from "./youtube/catalogWorker.js";
import { resumeAllInterrupted as resumeAllInterruptedTelegram } from "./telegram/worker.js";
import { startDailyVersePushSchedule } from "./jobs/dailyVerse.js";
import { startPickedForYouPushSchedule } from "./jobs/pickedForYou.js";

// Backstop for the whole process. Without this, any unhandled promise
// rejection anywhere — including in fire-and-forget background work like
// the YouTube catalog worker or the daily verse scheduler — crashes the
// entire server (Node's default since v15), taking down every route,
// login included, until something restarts it. That's exactly what
// happened when a transient DB connectivity blip inside catalogWorker.ts
// went unhandled: the whole API died along with the one background job
// that hit it. Individual call sites should still handle their own errors
// properly (see catalogWorker.ts's worker() try/catch) — this is only the
// last line of defense so a future oversight like that one degrades a
// single background task instead of the whole site.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server staying up):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server staying up):", err);
});

const app = express();

app.use(cors());

// Registered before express.json() and with its own raw-body parser: Stripe
// signs the exact bytes of the request body, so this route must see the
// untouched raw payload rather than a re-serialized parsed-then-stringified
// copy — using the app-wide JSON parser here would break signature
// verification on every event.
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);

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
app.use("/api/subscription", subscriptionRouter);
app.use("/api/bible-audio", bibleAudioRouter);
app.use("/api/featured-banners", featuredBannersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/library", adminLibraryRouter);
app.use("/api/admin/featured-banners", adminFeaturedBannersRouter);
app.use("/api/admin/youtube-import", youtubeImportRouter);
app.use("/api/admin/telegram-import", telegramImportRouter);

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
resumeAllInterruptedTelegram().catch((err) => {
  console.error("Failed to resume interrupted Telegram catalog imports:", err);
});

startDailyVersePushSchedule();
startPickedForYouPushSchedule();
