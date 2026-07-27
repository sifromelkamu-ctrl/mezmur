// Short-lived in-memory cache for detail-page `.get(id)` calls, keyed by a
// caller-chosen string (see prefetchRoute.ts's callers for the "album:id" /
// "artist:id" / etc. convention). Lets a touch/hover-triggered prefetch and
// the destination page's own on-mount fetch share one in-flight request
// instead of firing the same lookup twice — by the time the detail page
// actually mounts, the prefetch is often already done, so its own fetch
// resolves instantly from here.
const cache = new Map<string, { promise: Promise<unknown>; time: number }>();

// Long enough to bridge a hover/press-to-navigation gap (including a slow
// tap-then-decide), short enough that a stale admin edit isn't served for
// long if someone prefetches, edits the same record elsewhere, then opens it.
const TTL_MS = 20000;

export function cachedDetailFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < TTL_MS) return hit.promise as Promise<T>;
  const promise = fetcher();
  cache.set(key, { promise, time: Date.now() });
  // Never cache a rejection — the page's own fetch (or the next prefetch)
  // should get a clean retry, not a poisoned cached failure.
  promise.catch(() => cache.delete(key));
  return promise;
}

// Call after a mutation that a page re-fetches to reflect (e.g.
// PlaylistDetail re-running its `load()` after adding/removing a track) so
// that re-fetch actually hits the network instead of replaying whatever was
// cached from before the mutation.
export function invalidateDetailCache(key: string) {
  cache.delete(key);
}
