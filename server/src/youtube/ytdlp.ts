import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { GENERIC_IMPORT_ERROR, isInternalErrorMessage } from "./safeError.js";

export interface YoutubeMetadata {
  id: string;
  title: string;
  uploader: string | null;
  channel: string | null;
  channelUrl: string | null;
  duration: number | null;
  thumbnail: string | null;
  uploadDate: string | null; // YYYYMMDD
  webpageUrl: string;
  isLive: boolean;
  availability: string | null;
}

export class YtDlpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YtDlpError";
  }
}

// Every yt-dlp invocation funnels its failure through here. The message
// stored on a job row / returned to the client is always short (yt-dlp's
// own last stderr line, or a generic fallback for OS/environment failures —
// see safeError.ts) — but the COMPLETE stderr/stdout and the exact command
// that was run are always logged server-side first, in full, regardless of
// classification. yt-dlp's fatal line is rarely the whole story (format
// selection attempts, retries, and throttling notices all print before it),
// so the short message alone is often not enough to actually diagnose a
// failure — this is where the full picture is preserved (Render → service →
// Logs). A genuine yt-dlp content error ("Video unavailable", a copyright
// claim, a geo-block, bot-check, ...) is left exactly as yt-dlp worded it in
// the short message too, since that IS actionable on its own.
function toYtDlpError(rawStderr: string, rawStdout: string, exitCode: number | null, context: string, args: string[]): YtDlpError {
  const lastLine = rawStderr.trim().split("\n").pop();
  const message = lastLine ? lastLine.replace(/^ERROR:\s*/, "") : `yt-dlp exited with code ${exitCode}`;
  console.error(
    `[yt-dlp:${context}] failed (exit ${exitCode})\n` +
      `command: yt-dlp ${args.join(" ")}\n` +
      `stderr:\n${rawStderr.trim() || "(empty)"}` +
      (rawStdout.trim() ? `\nstdout:\n${rawStdout.trim()}` : "")
  );
  if (isInternalErrorMessage(message)) {
    return new YtDlpError(GENERIC_IMPORT_ERROR);
  }
  return new YtDlpError(message);
}

function ytDlpSpawnError(err: NodeJS.ErrnoException, context: string): YtDlpError {
  console.error(`[yt-dlp:${context}] spawn error:`, err);
  return new YtDlpError(GENERIC_IMPORT_ERROR);
}

function runYtDlp(args: string[], onLine?: (line: string, stream: "stdout" | "stderr") => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    createInterface({ input: child.stdout }).on("line", (line) => {
      stdout += line + "\n";
      onLine?.(line, "stdout");
    });
    createInterface({ input: child.stderr }).on("line", (line) => {
      stderr += line + "\n";
      onLine?.(line, "stderr");
    });

    child.on("error", (err) => reject(ytDlpSpawnError(err, "runYtDlp")));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(toYtDlpError(stderr, stdout, code, "runYtDlp", args));
      }
    });
  });
}

// Fetches video metadata without downloading anything. --no-playlist ensures
// that a URL containing a `list=` param only ever resolves to the single
// video, never an entire playlist.
export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  const stdout = await runYtDlp(["--dump-json", "--no-playlist", "--no-warnings", url]);
  const lastLine = stdout.trim().split("\n").pop();
  if (!lastLine) throw new YtDlpError("yt-dlp returned no metadata");

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(lastLine);
  } catch {
    throw new YtDlpError("Could not parse video metadata");
  }

  return {
    id: String(raw.id),
    title: typeof raw.title === "string" ? raw.title : "Untitled",
    uploader: typeof raw.uploader === "string" ? raw.uploader : null,
    channel: typeof raw.channel === "string" ? raw.channel : null,
    channelUrl:
      typeof raw.channel_url === "string" ? raw.channel_url : typeof raw.uploader_url === "string" ? raw.uploader_url : null,
    duration: typeof raw.duration === "number" ? Math.round(raw.duration) : null,
    thumbnail: typeof raw.thumbnail === "string" ? raw.thumbnail : null,
    uploadDate: typeof raw.upload_date === "string" ? raw.upload_date : null,
    webpageUrl: typeof raw.webpage_url === "string" ? raw.webpage_url : url,
    isLive: raw.is_live === true,
    availability: typeof raw.availability === "string" ? raw.availability : null,
  };
}

interface FlatEntry {
  videoId: string;
  title: string;
  duration: number | null;
}

export interface FlatPlaylist {
  title: string | null;
  channel: string | null;
  thumbnailUrl: string | null;
  // Every thumbnail yt-dlp reported, largest first. thumbnailUrl is just
  // candidates[0] — kept as its own field so existing callers don't need to
  // change, but the "biggest reported" thumbnail isn't always actually
  // fetchable (observed: an unsigned bare maxresdefault.jpg URL that 404s on
  // YouTube's CDN, while a smaller signed variant lower in this list loads
  // fine) — callers that need artwork to actually work should try these in
  // order rather than trusting thumbnailUrl alone.
  thumbnailCandidates: string[];
  entries: FlatEntry[];
}

interface RawThumbnail {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

// Ranks yt-dlp's thumbnails array by width*height, largest first — width*
// height varies a lot between entries, including tiny banner/avatar crops,
// so we can't just take the first one.
function rankedThumbnailUrls(thumbnails: unknown): string[] {
  if (!Array.isArray(thumbnails)) return [];
  const scored: { url: string; area: number }[] = [];
  for (const t of thumbnails as RawThumbnail[]) {
    if (typeof t.url !== "string") continue;
    scored.push({ url: t.url, area: (Number(t.width) || 0) * (Number(t.height) || 0) });
  }
  return scored.sort((a, b) => b.area - a.area).map((s) => s.url);
}

// Caps on catalog enumeration so a single "import artist catalog" run can't
// spiral into thousands of yt-dlp calls / an unmanageable selection list.
export const MAX_PLAYLISTS = 25;
const MAX_VIDEOS_PER_LIST = 200;

function runFlatPlaylistDump(url: string, limit: number): Promise<FlatPlaylist> {
  return new Promise((resolve, reject) => {
    const args = ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-end", String(limit), url];
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => reject(ytDlpSpawnError(err, "runFlatPlaylistDump")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(toYtDlpError(stderr, stdout, code, "runFlatPlaylistDump", args));
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        const entries: FlatEntry[] = Array.isArray(raw.entries)
          ? raw.entries
              .filter((e: Record<string, unknown>) => typeof e.id === "string")
              .map((e: Record<string, unknown>) => ({
                videoId: String(e.id),
                title: typeof e.title === "string" ? e.title : "Untitled",
                duration: typeof e.duration === "number" ? Math.round(e.duration) : null,
              }))
          : [];
        const thumbnailCandidates = rankedThumbnailUrls(raw.thumbnails);
        resolve({
          title: typeof raw.title === "string" ? raw.title : null,
          channel: typeof raw.channel === "string" ? raw.channel : typeof raw.uploader === "string" ? raw.uploader : null,
          thumbnailUrl: thumbnailCandidates[0] ?? null,
          thumbnailCandidates,
          entries,
        });
      } catch {
        reject(new YtDlpError("Could not parse playlist listing"));
      }
    });
  });
}

// Lists the videos in a channel's "Videos" tab (flat — no per-video
// metadata, just id/title/duration, which is enough to build the selection
// list quickly even for channels with hundreds of uploads).
export function listChannelVideos(channelUrl: string): Promise<FlatPlaylist> {
  return runFlatPlaylistDump(`${channelUrl}/videos`, MAX_VIDEOS_PER_LIST);
}

// Lists the playlists ("albums") published on a channel.
export function listChannelPlaylists(channelUrl: string): Promise<FlatPlaylist> {
  return runFlatPlaylistDump(`${channelUrl}/playlists`, MAX_PLAYLISTS);
}

// Lists a channel's official "Releases" — the auto-curated album/single
// shelf YouTube's Official Artist Channels get from linked YouTube Music
// metadata. Each entry is itself a release-specific playlist id (prefixed
// "OLAK5uy_..."), expandable via listPlaylistVideos. This is a much cleaner
// album signal than generic user playlists where it's available, since it's
// pre-curated by YouTube/the label rather than arbitrary compilations.
export function listChannelReleases(channelUrl: string): Promise<FlatPlaylist> {
  return runFlatPlaylistDump(`${channelUrl}/releases`, MAX_PLAYLISTS);
}

// Lists the videos within a single playlist (identified by its own flat-list
// entry id), used to expand each "album" found by listChannelPlaylists.
export function listPlaylistVideos(playlistId: string): Promise<FlatPlaylist> {
  return runFlatPlaylistDump(`https://www.youtube.com/playlist?list=${playlistId}`, MAX_VIDEOS_PER_LIST);
}

export interface ChannelSearchResult {
  title: string;
  channelUrl: string;
}

// Searches YouTube for channels by name (sp=EgIQAg is YouTube's "Channel"
// search-results filter). Last-resort fallback for re-deriving an artist's
// real channel when neither a past import batch nor any already-imported
// video's own metadata resolves to one — e.g. every video reports an
// auto-generated "Topic" channel instead of the real uploader channel.
// Results are heuristic (name matching, not a guaranteed identity), so
// callers should still verify a candidate actually works before trusting it.
export function searchChannelsByName(query: string, limit = 5): Promise<ChannelSearchResult[]> {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
    const args = ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-end", String(limit), url];
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => reject(ytDlpSpawnError(err, "searchChannelsByName")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(toYtDlpError(stderr, stdout, code, "searchChannelsByName", args));
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        const entries = Array.isArray(raw.entries) ? raw.entries : [];
        const results: ChannelSearchResult[] = entries
          .filter((e: Record<string, unknown>) => typeof e.url === "string" && typeof e.title === "string")
          .map((e: Record<string, unknown>) => ({ title: String(e.title), channelUrl: String(e.url) }));
        resolve(results);
      } catch {
        reject(new YtDlpError("Could not parse channel search results"));
      }
    });
  });
}

// Downloads the best available audio-only stream and extracts it to MP3
// (yt-dlp shells out to ffmpeg for the extraction). Reports 0-100 progress
// via onProgress by parsing yt-dlp's own `[download]  NN.N%` progress lines.
export async function downloadYoutubeAudio(
  url: string,
  outDir: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const outputTemplate = path.join(outDir, "audio.%(ext)s");
  const progressRe = /\[download\]\s+([\d.]+)%/;

  await runYtDlp(
    [
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "mp3",
      // A constant 160kbps keeps even a full-length (20 min, our enumeration
      // cap) track comfortably under Supabase's 50MB per-file limit, unlike
      // "--audio-quality 0" (best VBR), which can exceed it for long source
      // audio. 160kbps is still solid streaming quality.
      "--audio-quality",
      "160K",
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "-o",
      outputTemplate,
      url,
    ],
    (line) => {
      const match = line.match(progressRe);
      if (match) onProgress?.(Math.min(100, parseFloat(match[1])));
    }
  );

  const files = await readdir(outDir);
  const audioFile = files.find((f) => f.startsWith("audio."));
  if (!audioFile) throw new YtDlpError("Download completed but no audio file was produced");
  return path.join(outDir, audioFile);
}
