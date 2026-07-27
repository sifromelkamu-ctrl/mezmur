import { routeLoaders } from "./routeLoaders";

const pathMatchers: { test: (path: string) => boolean; load: () => Promise<unknown> }[] = [
  { test: (p) => p === "/artists", load: routeLoaders.artists },
  { test: (p) => p === "/search", load: routeLoaders.search },
  { test: (p) => p === "/library", load: routeLoaders.library },
  { test: (p) => p === "/bible", load: routeLoaders.bible },
  { test: (p) => p === "/songs", load: routeLoaders.allSongs },
  { test: (p) => p === "/singles", load: routeLoaders.allSingles },
  { test: (p) => p === "/concerts", load: routeLoaders.allConcerts },
  { test: (p) => p === "/sermons", load: routeLoaders.allSermons },
  { test: (p) => p === "/podcasts", load: routeLoaders.allPodcasts },
  { test: (p) => p === "/recommended", load: routeLoaders.recommended },
  { test: (p) => p === "/settings", load: routeLoaders.settings },
  { test: (p) => p.startsWith("/album/"), load: routeLoaders.albumDetail },
  { test: (p) => p.startsWith("/concert/"), load: routeLoaders.concertDetail },
  { test: (p) => p.startsWith("/my-artist/"), load: routeLoaders.customArtistDetail },
  { test: (p) => p.startsWith("/artist/"), load: routeLoaders.artistDetail },
  { test: (p) => p.startsWith("/sermon/"), load: routeLoaders.sermonDetail },
  { test: (p) => p.startsWith("/podcast/"), load: routeLoaders.podcastDetail },
  { test: (p) => p.startsWith("/playlist/"), load: routeLoaders.playlistDetail },
];

// Call on touch-start/pointer-down or hover intent against an internal nav
// target (a `to` prop, an href) so the destination route's JS chunk starts
// downloading before the tap/click that actually navigates there finishes —
// by the time React Router mounts the lazy component, the chunk is often
// already in the browser's cache. Dynamic import() is itself idempotent
// (repeat calls for the same specifier resolve from the same cached
// promise), so no extra de-duping is needed here.
export function prefetchRoute(path: string | undefined) {
  if (!path) return;
  const match = pathMatchers.find((m) => m.test(path));
  match?.load().catch(() => {});
}
