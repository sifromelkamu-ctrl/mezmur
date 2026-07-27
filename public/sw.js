// Started life as a Web Push receiver only (see src/lib/pushNotifications.ts
// for the daily Bible verse notification); now also caches static assets and
// artwork so repeat visits and flaky connections don't re-fetch everything.
// Registered unconditionally on every load from src/main.tsx — independent
// of whether the user has ever opted into push — so the caching layer below
// is active for everyone, not just push subscribers.

// Bump this when the caching strategy below changes so `activate` evicts the
// previous version's cache instead of serving stale entries forever.
const CACHE_VERSION = "v1";
const CACHE_NAME = `mezmur-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: built JS/CSS/fonts are content-hashed (or otherwise
// versioned), so a cached copy is never stale — only ever hit the network
// the first time a given URL is requested.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// Stale-while-revalidate: album/artist artwork can be re-cropped or swapped
// by an admin after the fact (see the Universal Artwork System elsewhere in
// this app), so unlike static assets it isn't safe to cache forever — serve
// the cached copy instantly if we have one, but always kick off a network
// fetch in the background to refresh the cache for next time.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // `destination` reflects what the browser is fetching regardless of
  // origin (same-origin build assets vs. cross-origin Supabase-hosted
  // artwork and Google Fonts alike) — plain fetch() calls like this app's
  // own API requests (src/lib/api.ts) have an empty destination and are
  // deliberately left alone here so auth/session data is never served
  // stale from cache.
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
  } else if (["script", "style", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Mezmur", body: "You have a new notification.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // non-JSON payload — fall back to the default text above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: data.url },
    })
  );
});

// Focuses an already-open app tab if one exists, otherwise opens a new one
// — always landing on the URL the push payload specified (the Bible tab).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
