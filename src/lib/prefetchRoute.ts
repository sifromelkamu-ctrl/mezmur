import { albumsApi, artistsApi, playlistsApi, podcastsApi, sermonsApi } from "./api";
import { cachedDetailFetch } from "./detailCache";
import { routeLoaders } from "./routeLoaders";

// `warmData`, when present, is handed the id parsed out of the path and
// fires the same cached fetch the destination detail page itself uses (see
// each detail page's own useEffect) — same cache key convention, so the
// page's on-mount fetch reuses this in-flight/completed request instead of
// firing a duplicate one.
const pathMatchers: { test: (path: string) => boolean; load: () => Promise<unknown>; warmData?: (id: string) => void }[] = [
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
  {
    test: (p) => p.startsWith("/album/"),
    load: routeLoaders.albumDetail,
    warmData: (id) => cachedDetailFetch(`album:${id}`, () => albumsApi.get(id)),
  },
  {
    test: (p) => p.startsWith("/concert/"),
    // ConcertDetail fetches through the same albumsApi.get (a Concert is
    // still an Album row under the hood) — same cache key shape as above.
    load: routeLoaders.concertDetail,
    warmData: (id) => cachedDetailFetch(`album:${id}`, () => albumsApi.get(id)),
  },
  { test: (p) => p.startsWith("/my-artist/"), load: routeLoaders.customArtistDetail },
  {
    test: (p) => p.startsWith("/artist/"),
    load: routeLoaders.artistDetail,
    warmData: (id) => cachedDetailFetch(`artist:${id}`, () => artistsApi.get(id)),
  },
  {
    test: (p) => p.startsWith("/sermon/"),
    load: routeLoaders.sermonDetail,
    warmData: (id) => cachedDetailFetch(`sermon:${id}`, () => sermonsApi.get(id)),
  },
  {
    test: (p) => p.startsWith("/podcast/"),
    load: routeLoaders.podcastDetail,
    warmData: (id) => cachedDetailFetch(`podcast:${id}`, () => podcastsApi.get(id)),
  },
  {
    test: (p) => p.startsWith("/playlist/"),
    load: routeLoaders.playlistDetail,
    warmData: (id) => cachedDetailFetch(`playlist:${id}`, () => playlistsApi.get(id)),
  },
];

// Call on touch-start/pointer-down or hover intent against an internal nav
// target (a `to` prop, an href) so the destination route's JS chunk *and*
// its data start loading before the tap/click that actually navigates there
// finishes — by the time the lazy component mounts, both are often already
// in hand. Dynamic import() is itself idempotent (repeat calls for the same
// specifier resolve from the same cached promise), so no extra de-duping is
// needed for `load`; `warmData` gets its own dedup via cachedDetailFetch.
export function prefetchRoute(path: string | undefined) {
  if (!path) return;
  const match = pathMatchers.find((m) => m.test(path));
  if (!match) return;
  match.load().catch(() => {});
  const id = path.split("/").filter(Boolean).pop();
  if (id) match.warmData?.(id);
}
