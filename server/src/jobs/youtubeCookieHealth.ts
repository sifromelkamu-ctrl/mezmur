import { notifyAdminsPush } from "../push.js";
import { fetchYoutubeMetadata, isBotCheckError, YtDlpError } from "../youtube/ytdlp.js";

// "Me at the zoo" — the first video ever uploaded to YouTube. Tiny, owned by
// a YouTube co-founder, never going anywhere: about as close to a guaranteed
// always-available probe target as a real YouTube URL gets, so a failure
// here is about cookies/bot-check, not this one video having a problem.
const CHECK_VIDEO_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — matches ytdlp.ts's own notify cooldown
const INITIAL_DELAY_MS = 2 * 60 * 1000; // run soon after boot, not a full interval after every restart

// null = not checked yet this process. Set true on any successful check,
// false only by a bot-check-shaped failure — an unrelated blip (network
// hiccup, yt-dlp binary missing, ...) logs but leaves this alone, so it
// can't be misread as "cookies recovered" or "cookies just broke".
let lastKnownHealthy: boolean | null = null;

// Proactively probes the same path a real import takes (fetchYoutubeMetadata
// → yt-dlp → toYtDlpError) on a schedule, so a dead/missing cookie is caught
// even on a day nobody happens to run an import — the failure case reuses
// ytdlp.ts's own cooldown-gated notifyAdminsOfBotCheckIfDue (triggered
// inside toYtDlpError), this function only adds the positive case: telling
// admins once cookies are working again, which nothing else in the app ever
// would.
export async function checkYoutubeCookieHealth(): Promise<void> {
  try {
    await fetchYoutubeMetadata(CHECK_VIDEO_URL);
    if (lastKnownHealthy === false) {
      void notifyAdminsPush({
        title: "YouTube import working again",
        body: "The bot-check block cleared — YouTube cookies are healthy again.",
        url: "/#/admin/youtube-catalog-import",
      });
    }
    lastKnownHealthy = true;
    console.log("[youtube-cookie-health] ok");
  } catch (err) {
    if (err instanceof YtDlpError && isBotCheckError(err.message)) {
      lastKnownHealthy = false;
      console.error("[youtube-cookie-health] bot-check failure — cookies missing or stale");
      return;
    }
    // Some other failure (network blip, yt-dlp itself unavailable, ...) —
    // worth logging, but not proof either way about cookie health.
    console.error("[youtube-cookie-health] check failed for a reason unrelated to bot-check:", err);
  }
}

// Same in-process setTimeout/setInterval shape as jobs/dailyVerse.ts — no
// separate cron infra, resets on deploy/restart, which is fine here too.
export function startYoutubeCookieHealthSchedule(): void {
  console.log(
    `YouTube cookie health check scheduled: first run in ${Math.round(INITIAL_DELAY_MS / 60000)} min, then every ${Math.round(
      CHECK_INTERVAL_MS / 3600000
    )}h.`
  );
  setTimeout(() => {
    checkYoutubeCookieHealth();
    setInterval(() => {
      checkYoutubeCookieHealth();
    }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
