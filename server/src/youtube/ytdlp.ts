import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readdir } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CancelledImportError, GENERIC_IMPORT_ERROR, isInternalErrorMessage } from "./safeError.js";

// Optional: a real YouTube account's cookies (Netscape cookies.txt format,
// base64-encoded into this env var), so every yt-dlp request carries an
// authenticated session instead of an anonymous one. Without this, YouTube's
// "Sign in to confirm you're not a bot" bot-check blocks essentially all
// datacenter/cloud IP ranges (confirmed in production — see the deploy
// runbook) — that's a property of the requesting IP's reputation, not of
// Render specifically or of this app's architecture, so no amount of
// re-platforming fixes it on its own. Decoded once at module load, not
// per-request, since the value never changes during the process's lifetime.
// Absent entirely (the default) yt-dlp just runs cookie-less exactly as
// before — existing behavior for anyone who hasn't set this yet.
const COOKIES_PATH = path.join(os.tmpdir(), "yt-dlp-cookies.txt");
// Fallback for a plain cookies.txt file dropped directly on disk (no env var
// involved) — checked in both the Docker image's working directory and next
// to this module, so a file committed/mounted at either location is picked
// up automatically. YTDLP_COOKIES_B64 takes priority when both are present
// since it's the documented, existing path or a per-deploy secret.
const FILE_COOKIES_CANDIDATES = [
  path.join(process.cwd(), "cookies.txt"),
  path.join(path.dirname(new URL(import.meta.url).pathname), "cookies.txt"),
];
const cookiesArgs: string[] = (() => {
  const b64 = process.env.YTDLP_COOKIES_B64?.trim();
  if (b64) {
    try {
      writeFileSync(COOKIES_PATH, Buffer.from(b64, "base64"));
      if (!existsSync(COOKIES_PATH)) {
        console.error("[yt-dlp] YTDLP_COOKIES_B64 was set but the cookies file didn't end up on disk after writing — running without cookies.");
      } else {
        const byteLength = Buffer.from(b64, "base64").byteLength;
        console.log(`[yt-dlp] loaded cookies from YTDLP_COOKIES_B64 (${byteLength} bytes) -> ${COOKIES_PATH}`);
        return ["--cookies", COOKIES_PATH];
      }
    } catch (err) {
      console.error("[yt-dlp] failed to write cookies file from YTDLP_COOKIES_B64:", err);
    }
  }

  const fileCookiePath = FILE_COOKIES_CANDIDATES.find((p) => existsSync(p));
  if (fileCookiePath) {
    console.log(`[yt-dlp] loaded cookies from ${fileCookiePath}`);
    return ["--cookies", fileCookiePath];
  }

  // Local-dev convenience only: pull cookies straight from an already
  // logged-in browser on this machine (e.g. YTDLP_COOKIES_FROM_BROWSER=chrome),
  // no manual export/base64 step needed. Never applies in production — the
  // Render process has no browser profile to read from, so nothing sets
  // this env var there; YTDLP_COOKIES_B64 remains the production path.
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) {
    console.log(`[yt-dlp] using cookies from local browser profile: ${browser}`);
    return ["--cookies-from-browser", browser];
  }

  console.log(
    "[yt-dlp] no cookies found (YTDLP_COOKIES_B64 unset, no cookies.txt on disk, YTDLP_COOKIES_FROM_BROWSER unset) — running without cookies (anonymous requests, likely to hit YouTube's bot-check on datacenter IPs)."
  );
  return [];
})();

// YouTube's "Sign in to confirm you're not a bot" check increasingly
// requires a proof-of-origin token for the default "web" player client,
// which cookies alone don't satisfy (confirmed in production: valid,
// complete auth cookies — SID/HSID/LOGIN_INFO/etc. — still hit this exact
// error). The "android" client uses a different, token-less auth flow and
// doesn't enforce that check; falling back to "web" after it keeps the
// existing behavior for anything android can't resolve. This is a
// widely-documented community workaround (yt-dlp's own "sign in to confirm
// you're not a bot" tracking issue), not a fix on this app's side of things.
//
// DO NOT drop "android" just because logs show yt-dlp skipping it whenever
// cookies are present ("does not support cookies") — that skip-and-fall-
// through-to-web is exactly the point, not dead weight. Tried removing it
// down to "web" alone once (2026-08-06) on the theory that it was always
// skipped anyway; caused real "Requested format is not available" failures
// across a live channel import within the hour. Reverted same-day. If
// you're looking at this because it seems redundant again, it isn't —
// leave it as "android,web".
//
// NOTE: "tv" and "ios" were tried first and rejected — both make even a
// bare --dump-json fail locally with "Requested format is not available",
// a real regression, not a YouTube-side block (reproduced with yt-dlp
// directly, no app code involved). android's own formats also skew
// towards combined video+audio (e.g. itag 18) rather than audio-only —
// harmless here since downloadYoutubeAudio always runs everything through
// `-x --audio-format mp3` anyway, which extracts just the audio track
// regardless of what the source container held.
const CLIENT_ARGS = ["--extractor-args", "youtube:player_client=android,web"];

// Public channels/playlists routinely fail with "[youtubetab] Playlists
// that require authentication may not extract correctly without a
// successful webpage download" whenever the initial webpage fetch itself
// gets blocked (the same bot-check IP-reputation issue CLIENT_ARGS/cookies
// above work around) — yt-dlp then can't tell whether the
// list actually needs auth or not, and some versions treat that as fatal
// even though the tab data itself came back fine via the API. This is
// yt-dlp's own documented flag for exactly this case: it skips that
// probe-and-guess step entirely rather than failing/guessing on it, so a
// genuinely public channel/playlist/release list always extracts. --extractor-args
// keys by extractor name, so this composes with CLIENT_ARGS's own
// "youtube:" args rather than overriding them (verified: both flags reach
// yt-dlp together and each extractor only reads its own key).
const TAB_ARGS = ["--extractor-args", "youtubetab:skip=authcheck"];

// The bgutil-ytdlp-pot-provider plugin (server/Dockerfile clones/builds it
// into /opt/bgutil-provider) generates a real proof-of-origin token via its
// sidecar server on localhost:4416 — the actual fix for what cookies/
// player-client alone couldn't fully solve, rather than a workaround.
// existsSync-gated because that directory only exists inside the Docker
// image; local dev (Homebrew yt-dlp, no Dockerfile involved) just never
// passes this flag and runs exactly as before.
const PLUGIN_DIR = "/opt/bgutil-provider/plugin";
const pluginArgs: string[] = existsSync(PLUGIN_DIR) ? ["--plugin-dirs", PLUGIN_DIR] : [];
if (pluginArgs.length) {
  console.log(`[yt-dlp] loaded PO-token plugin from ${PLUGIN_DIR} (expects its server sidecar on localhost:4416)`);
} else {
  console.log(`[yt-dlp] ${PLUGIN_DIR} not found — running without the PO-token plugin (expected outside the Docker image).`);
}

// Shared prefix for every yt-dlp invocation in this file — one definition so
// TAB_ARGS (or any future flag) only needs adding once instead of staying in
// sync across every spawn() call site by hand.
const BASE_ARGS = [...cookiesArgs, ...CLIENT_ARGS, ...TAB_ARGS, ...pluginArgs];

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

// Logs the exact argv, exit code, and complete stdout/stderr for every
// attempt (never the cookie file's own contents — only its path ever
// appears in argv, via --cookies). One low-level spawn, used by every
// call site below; success (code 0) resolves, everything else follows
// toYtDlpError/ytDlpSpawnError's existing classification.
function spawnOnce(
  fullArgs: string[],
  onLine?: (line: string, stream: "stdout" | "stderr") => void,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledImportError());
      return;
    }
    const child = spawn("yt-dlp", fullArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      // SIGKILL, not SIGTERM: the admin clicked cancel wanting it stopped
      // now, not "stopped once yt-dlp/ffmpeg finish their own graceful
      // shutdown". Safe to skip their cleanup — pipeline.ts force-removes
      // the whole tmp dir itself in a finally block regardless of how this
      // process ends. child.kill() is a no-op if it already exited.
      child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    createInterface({ input: child.stdout }).on("line", (line) => {
      stdout += line + "\n";
      onLine?.(line, "stdout");
    });
    createInterface({ input: child.stderr }).on("line", (line) => {
      stderr += line + "\n";
      onLine?.(line, "stderr");
    });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (cancelled) {
        reject(new CancelledImportError());
        return;
      }
      console.log(`[yt-dlp] yt-dlp ${fullArgs.join(" ")} -> exit ${code}`);
      resolve({ stdout, stderr, code });
    });
  });
}

// Shared entry point for every yt-dlp invocation in this file.
async function execYtDlp(
  args: string[],
  context: string,
  onLine?: (line: string, stream: "stdout" | "stderr") => void,
  signal?: AbortSignal
): Promise<string> {
  let attempt: { stdout: string; stderr: string; code: number | null };
  try {
    attempt = await spawnOnce([...BASE_ARGS, ...args], onLine, signal);
  } catch (err) {
    if (err instanceof CancelledImportError) throw err;
    throw ytDlpSpawnError(err as NodeJS.ErrnoException, context);
  }

  if (attempt.code === 0) return attempt.stdout;

  throw toYtDlpError(attempt.stderr, attempt.stdout, attempt.code, context, args);
}

function runYtDlp(
  args: string[],
  onLine?: (line: string, stream: "stdout" | "stderr") => void,
  signal?: AbortSignal
): Promise<string> {
  return execYtDlp(args, "runYtDlp", onLine, signal);
}

// Fetches video metadata without downloading anything. --no-playlist ensures
// that a URL containing a `list=` param only ever resolves to the single
// video, never an entire playlist.
export async function fetchYoutubeMetadata(url: string, signal?: AbortSignal): Promise<YoutubeMetadata> {
  const stdout = await runYtDlp(
    ["--dump-json", "--no-playlist", "--no-warnings", "--retries", "3", "--socket-timeout", "15", url],
    undefined,
    signal
  );
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

async function runFlatPlaylistDump(url: string, limit: number): Promise<FlatPlaylist> {
  const args = ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-end", String(limit), url];
  const stdout = await execYtDlp(args, "runFlatPlaylistDump");
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
    return {
      title: typeof raw.title === "string" ? raw.title : null,
      channel: typeof raw.channel === "string" ? raw.channel : typeof raw.uploader === "string" ? raw.uploader : null,
      thumbnailUrl: thumbnailCandidates[0] ?? null,
      thumbnailCandidates,
      entries,
    };
  } catch {
    throw new YtDlpError("Could not parse playlist listing");
  }
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
export async function searchChannelsByName(query: string, limit = 5): Promise<ChannelSearchResult[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
  const args = ["--flat-playlist", "--dump-single-json", "--no-warnings", "--playlist-end", String(limit), url];
  const stdout = await execYtDlp(args, "searchChannelsByName");
  try {
    const raw = JSON.parse(stdout);
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    return entries
      .filter((e: Record<string, unknown>) => typeof e.url === "string" && typeof e.title === "string")
      .map((e: Record<string, unknown>) => ({ title: String(e.title), channelUrl: String(e.url) }));
  } catch {
    throw new YtDlpError("Could not parse channel search results");
  }
}

// Downloads the best available audio-only stream and extracts it to MP3
// (yt-dlp shells out to ffmpeg for the extraction). Reports 0-100 progress
// via onProgress by parsing yt-dlp's own `[download]  NN.N%` progress lines.
export async function downloadYoutubeAudio(
  url: string,
  outDir: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
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
      // yt-dlp's defaults (10 retries, no socket timeout) are tuned for an
      // interactive user waiting on one download — under load, that let a
      // single stalled connection eat 7-8 minutes before giving up
      // (confirmed in production). A flaky attempt now fails in well under
      // a minute instead of stalling the whole sequential queue behind it;
      // a healthy connection is unaffected either way.
      "--retries",
      "3",
      "--fragment-retries",
      "3",
      "--socket-timeout",
      "15",
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
    },
    signal
  );

  const files = await readdir(outDir);
  const audioFile = files.find((f) => f.startsWith("audio."));
  if (!audioFile) throw new YtDlpError("Download completed but no audio file was produced");
  return path.join(outDir, audioFile);
}
