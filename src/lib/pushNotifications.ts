import { pushApi } from "./api";

export const pushSupported =
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

// Web Push wants the VAPID key as a raw Uint8Array, but servers hand it out
// URL-safe-base64-encoded (the only format that survives cleanly in a query
// string/JSON without escaping) — this is the standard conversion between
// the two forms.
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Requests Notification permission (if not already decided) and creates a
// Push subscription, then registers it with the backend. Throws if the user
// denies permission or the browser has no Push support — callers should
// catch and show their own "couldn't enable" message.
export async function subscribeToDailyVerse(): Promise<void> {
  if (!pushSupported) throw new Error("Push notifications aren't supported in this browser");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const registration = await getRegistration();
  if (!registration) throw new Error("Push notifications aren't supported in this browser");

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await pushApi.publicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Push subscription is missing required fields");
  }
  await pushApi.subscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
}

export async function unsubscribeFromDailyVerse(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await pushApi.unsubscribe(endpoint);
}

// Whether the CURRENT device is both subscribed at the browser level and
// still recognized by the backend — a subscription can exist in the browser
// but have been pruned server-side (e.g. it went stale and a push bounced),
// so both need to agree before showing the bell as "on".
export async function isDailyVerseSubscribed(): Promise<boolean> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return false;
  try {
    const { subscribed } = await pushApi.isSubscribed(subscription.endpoint);
    return subscribed;
  } catch {
    return false;
  }
}
