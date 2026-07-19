// Minimal service worker — exists only to receive Web Push events for the
// daily Bible verse notification (see src/lib/pushNotifications.ts). Not a
// full PWA/offline service worker: no caching, no install/activate work.

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
