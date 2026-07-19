import { prisma } from "../prisma.js";
import { dailyVerseIndexForUser, MORNING_VERSES, pushConfigured, sendPush } from "../push.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://mezmur-nu.vercel.app";
const PUSH_HOUR_UTC = Number(process.env.DAILY_VERSE_PUSH_HOUR_UTC ?? 6);
const DAY_MS = 24 * 60 * 60 * 1000;

type BookText = Record<string, (string | null)[]>;

// One fetch per distinct book per run (not per user) — several users can
// easily land on the same book (Psalms dominates the curated list), and the
// frontend's own comment notes a full book's JSON can run to a meaningful
// fraction of a megabyte, not worth re-fetching per subscriber.
async function fetchBookCached(cache: Map<string, BookText | null>, slug: string): Promise<BookText | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  const data = await fetch(`${FRONTEND_URL}/bible/${slug}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<BookText>) : null))
    .catch(() => null);
  cache.set(slug, data);
  return data;
}

export async function sendDailyVerseNotifications(): Promise<void> {
  if (!pushConfigured) {
    console.log("Daily verse push skipped: VAPID keys not configured.");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany();
  if (subscriptions.length === 0) return;

  const byUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    const list = byUser.get(sub.userId) ?? [];
    list.push(sub);
    byUser.set(sub.userId, list);
  }

  const today = new Date();
  const bookCache = new Map<string, BookText | null>();
  const staleEndpoints: string[] = [];
  let sent = 0;

  for (const [userId, subs] of byUser) {
    const pick = MORNING_VERSES[dailyVerseIndexForUser(userId, today)];
    const book = await fetchBookCached(bookCache, pick.slug);
    const text = book?.[String(pick.chapter)]?.[pick.verseIndex];
    if (!text) continue; // missing/corrupted verse — skip this user rather than send a blank push

    const payload = {
      title: "የዕለቱ ቃል",
      body: `${text} — ${pick.refAm}`,
      url: "/#/bible",
    };

    for (const sub of subs) {
      const result = await sendPush(sub, payload);
      if (result === "ok") sent++;
      else if (result === "gone") staleEndpoints.push(sub.endpoint);
    }
  }

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: staleEndpoints } } });
  }

  console.log(
    `Daily verse push: sent to ${sent}/${subscriptions.length} subscriptions across ${byUser.size} users` +
      (staleEndpoints.length > 0 ? `, pruned ${staleEndpoints.length} stale subscription(s)` : "")
  );
}

// In-process daily timer — no separate cron infra. Fires once at the next
// occurrence of PUSH_HOUR_UTC, then every 24h after that. Living in the same
// always-on API process means it resets on deploy/restart (recomputed from
// the current time), which is fine: worst case is a single day's send
// shifting by however long the restart took.
export function startDailyVersePushSchedule(): void {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), PUSH_HOUR_UTC, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const initialDelay = next.getTime() - now.getTime();

  console.log(`Daily verse push scheduled for ${next.toISOString()} (in ${Math.round(initialDelay / 60000)} min), then every 24h.`);

  setTimeout(() => {
    sendDailyVerseNotifications().catch((err) => console.error("Daily verse push failed:", err));
    setInterval(() => {
      sendDailyVerseNotifications().catch((err) => console.error("Daily verse push failed:", err));
    }, DAY_MS);
  }, initialDelay);
}
