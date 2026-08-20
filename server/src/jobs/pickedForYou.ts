import { prisma } from "../prisma.js";
import { DEVOTIONAL_LINES } from "../data/devotionalLines.js";
import { pickedForYouIndexForUser, pushConfigured, sendPush } from "../push.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Two fixed UTC hours rather than per-user local time (same simplification
// dailyVerse.ts already makes — no timezone stored per profile today).
// Spaced well clear of the 6-UTC daily verse push so a subscriber never
// gets two pushes back to back.
const MORNING_HOUR_UTC = Number(process.env.PICKED_FOR_YOU_MORNING_HOUR_UTC ?? 9);
const EVENING_HOUR_UTC = Number(process.env.PICKED_FOR_YOU_EVENING_HOUR_UTC ?? 16);

export async function sendPickedForYouNotifications(slot: 0 | 1): Promise<void> {
  if (!pushConfigured) {
    console.log("Picked for You push skipped: VAPID keys not configured.");
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
  const staleEndpoints: string[] = [];
  let sent = 0;

  for (const [userId, subs] of byUser) {
    const line = DEVOTIONAL_LINES[pickedForYouIndexForUser(userId, today, slot, DEVOTIONAL_LINES.length)];
    const payload = { title: "Picked for You", body: line, url: "/#/" };

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
    `Picked for You push (slot ${slot}): sent to ${sent}/${subscriptions.length} subscriptions across ${byUser.size} users` +
      (staleEndpoints.length > 0 ? `, pruned ${staleEndpoints.length} stale subscription(s)` : "")
  );
}

// Same in-process daily-timer approach as dailyVerse.ts's
// startDailyVersePushSchedule — no separate cron infra, resets cleanly on
// deploy/restart. Two independent timers, one per fixed slot.
function scheduleDailyAt(hourUtc: number, run: () => void): void {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const initialDelay = next.getTime() - now.getTime();

  console.log(`Picked for You push scheduled for ${next.toISOString()} (in ${Math.round(initialDelay / 60000)} min), then every 24h.`);

  setTimeout(() => {
    run();
    setInterval(run, DAY_MS);
  }, initialDelay);
}

export function startPickedForYouPushSchedule(): void {
  scheduleDailyAt(MORNING_HOUR_UTC, () => {
    sendPickedForYouNotifications(0).catch((err) => console.error("Picked for You (morning) push failed:", err));
  });
  scheduleDailyAt(EVENING_HOUR_UTC, () => {
    sendPickedForYouNotifications(1).catch((err) => console.error("Picked for You (evening) push failed:", err));
  });
}
