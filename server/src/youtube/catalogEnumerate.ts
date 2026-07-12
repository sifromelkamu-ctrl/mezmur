import { prisma } from "../prisma.js";
import {
  fetchYoutubeMetadata,
  listChannelPlaylists,
  listChannelReleases,
  listChannelVideos,
  listPlaylistVideos,
  MAX_PLAYLISTS,
} from "./ytdlp.js";

// Hard ceiling on how many songs a single "import artist catalog" run can
// enumerate, on top of the per-list caps in ytdlp.ts (MAX_PLAYLISTS,
// MAX_VIDEOS_PER_LIST) — keeps the selection UI and the resulting DB rows to
// a manageable size even for very large channels.
const MAX_TOTAL_ITEMS = 500;

// Standalone-single candidates (the channel's main Videos tab) mix real
// songs in with shorts, teasers, full-album compilation videos, and other
// non-atomic content. Release-tab tracks don't need this filter — they're
// already curated by YouTube/the label — but anything picked up only from
// the Videos tab gets checked against these heuristics before being offered
// as an importable single.
const NON_MUSIC_TITLE_RE =
  /\b(full album|trailer|teaser|interview|live ?stream|podcast|vlog|reaction|#?shorts|coming soon|announcement|promo)\b/i;
const MIN_SINGLE_DURATION_SECONDS = 90;
const MAX_SINGLE_DURATION_SECONDS = 1200;

function looksLikeNonMusic(title: string, duration: number | null): boolean {
  if (NON_MUSIC_TITLE_RE.test(title)) return true;
  if (duration != null && (duration < MIN_SINGLE_DURATION_SECONDS || duration > MAX_SINGLE_DURATION_SECONDS)) return true;
  return false;
}

interface CatalogEntry {
  videoId: string;
  title: string;
  albumTitle: string | null;
  albumCoverUrl: string | null;
  // Every album-cover thumbnail candidate yt-dlp reported for this release/
  // playlist, largest first (albumCoverUrl is just candidates[0]) — the
  // top-ranked one isn't always actually fetchable (an unsigned URL that
  // 404s on YouTube's CDN while a smaller signed variant loads fine is a
  // real, observed case), so anything that needs the cover to actually work
  // should try these in order rather than trusting albumCoverUrl alone.
  albumCoverCandidates: string[];
  position: number;
  thumbnailUrl: string;
  duration: number | null;
  isDuplicate: boolean;
}

export interface CatalogEnumeration {
  channelName: string | null;
  items: CatalogEntry[];
  truncated: boolean;
}

function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Enumerates a channel's official releases ("albums", preferred) or generic
// playlists (fallback for channels without a curated Releases tab), plus
// standalone videos ("singles"), flattening them into one ordered list of
// candidate items. A video that appears in an album is grouped under that
// album's title; anything only found in the channel's main Videos tab is
// offered as a single, after filtering out non-music content. Videos already
// present in the catalog (matched by sourceId) are flagged isDuplicate so
// the UI can grey them out and the worker can skip them.
export async function enumerateYoutubeCatalog(channelUrl: string): Promise<CatalogEnumeration> {
  const seen = new Set<string>();
  const rawItems: Omit<CatalogEntry, "isDuplicate">[] = [];
  let channelName: string | null = null;
  let truncated = false;

  // yt-dlp exits non-zero (throws) for a channel with no Releases tab at all,
  // rather than returning an empty list — that's a normal, expected case for
  // most channels (only YouTube Official Artist Channels get one), so it
  // falls back to generic playlists the same as an empty-but-successful result.
  let albumSource;
  try {
    albumSource = await listChannelReleases(channelUrl);
  } catch {
    albumSource = { title: null, channel: null, thumbnailUrl: null, thumbnailCandidates: [], entries: [] };
  }
  if (albumSource.entries.length === 0) {
    albumSource = await listChannelPlaylists(channelUrl);
  }
  channelName = albumSource.channel ?? channelName;

  for (const albumEntry of albumSource.entries.slice(0, MAX_PLAYLISTS)) {
    if (rawItems.length >= MAX_TOTAL_ITEMS) {
      truncated = true;
      break;
    }
    let videos;
    try {
      videos = await listPlaylistVideos(albumEntry.videoId);
    } catch {
      continue; // a single unreadable album (private/deleted) shouldn't fail the whole enumeration
    }
    const albumCoverUrl = videos.thumbnailUrl;
    const albumCoverCandidates = videos.thumbnailCandidates;
    videos.entries.forEach((v, i) => {
      if (seen.has(v.videoId) || rawItems.length >= MAX_TOTAL_ITEMS) return;
      seen.add(v.videoId);
      rawItems.push({
        videoId: v.videoId,
        title: v.title,
        albumTitle: albumEntry.title,
        albumCoverUrl,
        albumCoverCandidates,
        position: i,
        thumbnailUrl: albumCoverUrl ?? thumbnailFor(v.videoId),
        duration: v.duration,
      });
    });
  }

  let channelVideos;
  try {
    channelVideos = await listChannelVideos(channelUrl);
    channelName = channelVideos.channel ?? channelName;
  } catch {
    channelVideos = { title: null, channel: null, thumbnailUrl: null, thumbnailCandidates: [], entries: [] };
  }

  channelVideos.entries.forEach((v, i) => {
    if (seen.has(v.videoId)) return;
    if (looksLikeNonMusic(v.title, v.duration)) return;
    if (rawItems.length >= MAX_TOTAL_ITEMS) {
      truncated = true;
      return;
    }
    seen.add(v.videoId);
    rawItems.push({
      videoId: v.videoId,
      title: v.title,
      albumTitle: null,
      albumCoverCandidates: [],
      albumCoverUrl: null,
      position: i,
      thumbnailUrl: thumbnailFor(v.videoId),
      duration: v.duration,
    });
  });

  if (rawItems.length === 0) {
    throw new Error("No videos or playlists found for this channel");
  }

  const existing = await prisma.track.findMany({
    where: { sourceId: { in: rawItems.map((i) => i.videoId) } },
    select: { sourceId: true },
  });
  const existingIds = new Set(existing.map((t) => t.sourceId));

  return {
    channelName,
    truncated,
    items: rawItems.map((item) => ({ ...item, isDuplicate: existingIds.has(item.videoId) })),
  };
}

async function flagDuplicates(rawItems: Omit<CatalogEntry, "isDuplicate">[]): Promise<CatalogEntry[]> {
  const existing = await prisma.track.findMany({
    where: { sourceId: { in: rawItems.map((i) => i.videoId) } },
    select: { sourceId: true },
  });
  const existingIds = new Set(existing.map((t) => t.sourceId));
  return rawItems.map((item) => ({ ...item, isDuplicate: existingIds.has(item.videoId) }));
}

// Enumerates one specific playlist directly (bulk-import mode: "playlist"),
// rather than discovering albums from a whole channel. All of its tracks are
// grouped under one album named after the playlist itself.
export async function enumerateYoutubePlaylist(playlistId: string): Promise<CatalogEnumeration> {
  const videos = await listPlaylistVideos(playlistId);
  if (videos.entries.length === 0) throw new Error("This playlist is empty or unavailable");

  const albumTitle = videos.title ?? "Imported Playlist";
  const rawItems = videos.entries.map((v, i) => ({
    videoId: v.videoId,
    title: v.title,
    albumTitle,
    albumCoverUrl: videos.thumbnailUrl,
    albumCoverCandidates: videos.thumbnailCandidates,
    position: i,
    thumbnailUrl: videos.thumbnailUrl ?? thumbnailFor(v.videoId),
    duration: v.duration,
  }));

  return {
    channelName: videos.channel,
    truncated: false,
    items: await flagDuplicates(rawItems),
  };
}

// Enumerates a fixed list of individual video URLs directly (bulk-import
// mode: "multiple URLs") — each becomes an ungrouped standalone item, since
// there's no shared album context to infer for an arbitrary URL list.
export async function enumerateYoutubeVideoUrls(urls: string[]): Promise<CatalogEnumeration> {
  const rawItems: Omit<CatalogEntry, "isDuplicate">[] = [];
  let channelName: string | null = null;

  for (let i = 0; i < urls.length; i++) {
    try {
      const metadata = await fetchYoutubeMetadata(urls[i]);
      channelName = channelName ?? metadata.uploader ?? metadata.channel;
      rawItems.push({
        videoId: metadata.id,
        title: metadata.title,
        albumTitle: null,
        albumCoverUrl: null,
        albumCoverCandidates: [],
        position: i,
        thumbnailUrl: metadata.thumbnail ?? thumbnailFor(metadata.id),
        duration: metadata.duration,
      });
    } catch {
      // an individual bad/unavailable URL shouldn't fail the whole batch
    }
  }
  if (rawItems.length === 0) throw new Error("None of the provided URLs could be read");

  return {
    channelName,
    truncated: false,
    items: await flagDuplicates(rawItems),
  };
}
