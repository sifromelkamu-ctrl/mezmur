const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

// Users very commonly paste a channel/video URL with no scheme at all
// (copied from an address bar that displays it without "https://", or just
// typed from memory) — `new URL()` rejects those outright since it requires
// an absolute URL. Retrying once with "https://" prepended, but only for
// strings that don't already look like they have some other scheme, so this
// stays a fallback rather than silently rewriting genuinely malformed input.
function parseLenientUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  try {
    return new URL(trimmed);
  } catch {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

// Extracts an 11-character YouTube video ID from any of the common URL
// shapes (watch?v=, youtu.be/, shorts/, embed/, /v/), or returns null if the
// URL isn't a recognizable YouTube video link at all.
export function extractYoutubeVideoId(rawUrl: string): string | null {
  const url = parseLenientUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;

  if (url.hostname === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id && VIDEO_ID_RE.test(id) ? id : null;
  }

  const vParam = url.searchParams.get("v");
  if (vParam && VIDEO_ID_RE.test(vParam)) return vParam;

  const pathMatch = url.pathname.match(/^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
  if (pathMatch) return pathMatch[2];

  return null;
}

// Accepts a channel/artist URL (@handle, /channel/UC…, /c/Name, /user/name)
// and normalizes it to a bare channel URL with no trailing tab, so callers
// can safely append "/videos" or "/playlists". Returns null for anything
// that isn't a recognizable YouTube channel link — in particular, single
// video/watch/shorts URLs are rejected here (those belong to the single-URL
// import flow, not the catalog one).
export function normalizeYoutubeChannelUrl(rawUrl: string): string | null {
  const url = parseLenientUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname) || url.hostname === "youtu.be") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const [first, second] = segments;
  if (first.startsWith("@")) return `https://www.youtube.com/${first}`;
  if (["channel", "c", "user"].includes(first) && second) return `https://www.youtube.com/${first}/${second}`;
  return null;
}

// Extracts a playlist id from a direct playlist URL
// (youtube.com/playlist?list=... or a watch URL carrying a list= param),
// so a bulk import can target one specific playlist instead of a whole
// channel. Returns null for anything else, including channel URLs.
export function extractYoutubePlaylistId(rawUrl: string): string | null {
  const url = parseLenientUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname) || url.hostname === "youtu.be") return null;

  const list = url.searchParams.get("list");
  return list && /^[a-zA-Z0-9_-]+$/.test(list) ? list : null;
}
