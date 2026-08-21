import webpush from "web-push";
import { prisma } from "./prisma.js";
import morningVerses from "./data/morningVerses.json" with { type: "json" };

export interface MorningVerseRef {
  slug: string;
  chapter: number;
  verseIndex: number;
  refAm: string;
}

// Kept in sync by hand with src/data/morningVerses.ts on the frontend —
// only the small reference list (slug/chapter/verseIndex/refAm) is
// duplicated here, not the actual Bible text, which stays a single source
// of truth in the deployed frontend's public/bible/*.json files (fetched at
// send time in jobs/dailyVerse.ts instead of ever being copied server-side).
export const MORNING_VERSES = morningVerses as MorningVerseRef[];

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

export const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (pushConfigured) {
  webpush.setVapidDetails(vapidSubject!, vapidPublicKey!, vapidPrivateKey!);
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey ?? null;
}

// Well-mixed 32-bit integer hash (Murmur3-style finalizer), same approach as
// the frontend's dailyVerseIndexFor (src/pages/Bible.tsx) — a plain
// `hash*31+char` string hash leaves consecutive days walking through nearly
// adjacent indices instead of shuffling, which read as "not really random."
function mix32(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Salted with the user's id (mixed with the well-shuffled day number, not
// just concatenated into a string) so each subscriber gets a different but
// stable verse each day instead of everyone receiving an identical push.
export function dailyVerseIndexForUser(userId: string, date: Date): number {
  const dayNumber = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
  const seed = (hashString(userId) ^ mix32(dayNumber)) >>> 0;
  return mix32(seed) % MORNING_VERSES.length;
}

// Same idea as dailyVerseIndexForUser, but "Picked for You" fires twice a
// day (see jobs/pickedForYou.ts) — `slot` (0 = morning, 1 = evening) is
// mixed into the seed too, so the two same-day pushes don't repeat the same
// line for a user, on top of different users still seeing different lines.
export function pickedForYouIndexForUser(userId: string, date: Date, slot: number, poolSize: number): number {
  const dayNumber = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
  const seed = (hashString(userId) ^ mix32(dayNumber) ^ mix32(slot + 1)) >>> 0;
  return mix32(seed) % poolSize;
}

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Returns "gone" for subscriptions the push service says no longer exist
// (410 Gone / 404 Not Found — the user uninstalled, cleared site data, or
// revoked permission) so the caller can prune them; "error" for anything
// else (transient network/service issues, worth keeping and retrying next
// time); "ok" on success.
export async function sendPush(
  subscription: WebPushSubscription,
  payload: { title: string; body: string; url: string }
): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("Push send failed:", err);
    return "error";
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

// Shared plumbing for notifyAdminsPush/notifyUserPush below — sends one push
// to every subscription across a set of users, pruning any the push service
// reports gone (uninstalled/revoked), same as jobs/pickedForYou.ts. Silently
// does nothing without VAPID configured or if none of the target users have
// a subscription — every call site here is a best-effort in-app nudge, not
// something the action it's attached to (a message/submission being saved)
// can depend on succeeding.
async function pushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushConfigured || userIds.length === 0) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subscriptions.length === 0) return;

  const staleEndpoints: string[] = [];
  for (const sub of subscriptions) {
    const result = await sendPush(sub, payload);
    if (result === "gone") staleEndpoints.push(sub.endpoint);
  }
  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: staleEndpoints } } });
  }
}

// Pushes every admin/owner account (role: "admin") — never a single fixed
// id, so adding another admin automatically includes them with no code
// change. An admin who's never enabled push on any device just gets
// nothing here; they still see it in the in-app inbox/queue either way.
export async function notifyAdminsPush(payload: PushPayload): Promise<void> {
  const admins = await prisma.profile.findMany({ where: { role: "admin" }, select: { id: true } });
  await pushToUsers(admins.map((a) => a.id), payload);
}

// Pushes one specific user across every device they've enabled push on.
export async function notifyUserPush(userId: string, payload: PushPayload): Promise<void> {
  await pushToUsers([userId], payload);
}
