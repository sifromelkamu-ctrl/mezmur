import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";
import { toTrackDTO } from "../routes/artists.js";
import { similarity } from "../artwork/matching.js";
import { normalizeYoutubeChannelUrl } from "./validate.js";
import {
  downloadYoutubeAudio,
  fetchYoutubeMetadata,
  listChannelPlaylists,
  listChannelReleases,
  listChannelVideos,
  YtDlpError,
} from "./ytdlp.js";
import { generateWaveform } from "./waveform.js";
import { CancelledImportError } from "./safeError.js";
import {
  createSignedAudioUploadUrl,
  DuplicateImportError,
  findExistingArtist,
  findOrCreateAlbum,
  findOrCreateArtist,
  IDENTITY_MIN,
  importImageFromUrl,
} from "../catalogImport/shared.js";
import type { AlbumType } from "../generated/prisma/enums.js";

export { CancelledImportError, DuplicateImportError };

// Not every channel exposes a "Videos" tab — YouTube Music-style Official
// Artist Channels in particular often only have Releases/Playlists — so a
// channel avatar lookup that only ever tries /videos silently fails for
// those. Tries each tab in turn and uses whichever first reports any
// thumbnails, since all three report the same channel-level avatar
// candidates. Returns every candidate (largest first), not just the top
// pick — the top-ranked one isn't always actually fetchable (an unsigned
// URL that 404s on YouTube's CDN while a smaller signed variant loads fine
// is a real, observed case), so callers should try them in order via
// importBestReachableImage rather than trusting the first one blindly.
export async function fetchChannelThumbnailCandidates(channelUrl: string): Promise<string[]> {
  for (const list of [listChannelVideos, listChannelReleases, listChannelPlaylists]) {
    try {
      const listing = await list(channelUrl);
      if (listing.thumbnailCandidates.length > 0) return listing.thumbnailCandidates;
    } catch {
      // this tab doesn't exist on this channel — try the next one
    }
  }
  return [];
}

// Tries each candidate URL in order (largest/best first) and uploads
// whichever one actually downloads successfully — see
// fetchChannelThumbnailCandidates for why the top-ranked candidate alone
// isn't reliable enough to trust.
export async function importBestReachableImage(candidates: (string | null | undefined)[]): Promise<string | undefined> {
  for (const url of candidates) {
    if (!url) continue;
    const uploaded = await importImageFromUrl(url);
    if (uploaded) return uploaded;
  }
  return undefined;
}

export interface ImportVideoParams {
  url: string;
  adminId: string;
  albumId?: string;
  genre?: string;
  // True only when "Import from YouTube" had the "Single" destination
  // explicitly chosen — see routes/singles.ts for why this is a deliberate
  // flag rather than inferred from albumId being empty.
  isSingle?: boolean;
  // Overrides the track's title — set by the "Edit Metadata" step (Single
  // destination) once the admin has reviewed/edited the detected title.
  // Catalog/quick imports that never show that step leave this unset, so
  // metadata.title (the video's own title) is used exactly as before.
  titleOverride?: string;
  // Overrides the artist name that would otherwise be derived from the
  // video's own uploader/channel metadata. Catalog imports pass the
  // channel name here so every track from one "import artist catalog" run
  // is attributed to the same artist, regardless of per-video metadata. The
  // single-video "Edit Metadata" step also sets this, to whatever the admin
  // edited the artist name to — used both for matching an existing artist
  // and (with createArtist below) for naming a brand-new one.
  artistNameOverride?: string;
  // Explicit opt-in (Edit Metadata step only) to create a brand-new artist
  // named artistNameOverride rather than leaving an unmatched Single
  // unassigned — set only when the admin typed a name that matched nothing
  // and didn't pick an existing artist from the searchable list either.
  createArtist?: boolean;
  // Pins the import to this exact artist, bypassing name-based matching
  // entirely — set by the catalog worker from the admin's explicit
  // "Existing Artist"/"Create New Artist" choice (see
  // routes/youtubeCatalogImport.ts), never guessed. When set, this always
  // wins over artistNameOverride. The single-video quick-import job never
  // sets this, so it keeps resolving the artist by name exactly as before.
  targetArtistId?: string;
  // When set, the track is filed under this album (found by title under the
  // current artist, or created if it doesn't exist yet) instead of — or in
  // addition to — an explicit albumId. Lets catalog imports group tracks
  // into real Album rows by the album/release title alone, without the
  // caller having to look up or pre-create the Album itself.
  albumTitle?: string;
  // The catalog batch's "Regular Album" vs "Concert Album" destination
  // choice (see routes/youtubeCatalogImport.ts) — only meaningful alongside
  // albumTitle, and only actually applied when findOrCreateAlbum ends up
  // creating a brand-new album rather than matching an existing one (see
  // findOrCreateAlbum below for why). The single-video quick-import job
  // never sets this.
  albumType?: AlbumType;
  trackNumber?: number;
  // "Concert" destination, "Create new concert" mode only (see
  // YoutubeImport.tsx) — creates a brand-new Album row tagged
  // albumType: "live" instead of reusing/finding one by title the way
  // albumTitle/findOrCreateAlbum does. titleOverride (already used by the
  // Single flow's Edit Metadata step) doubles as the concert's own title
  // here. Mutually exclusive with albumTitle/albumId in practice — the
  // client only ever sends one destination's fields.
  newConcert?: boolean;
  concertYear?: number;
  concertGenre?: string;
  concertDescription?: string;
  // "Concert" destination, "Add as standalone Concert Song" mode (see
  // YoutubeImport.tsx) — the track is saved with no album at all
  // (Track.isConcertSong instead), so it surfaces directly in Home's
  // Concerts section as its own tile rather than opening a tracklist.
  // Mutually exclusive with newConcert/albumId/albumTitle in practice — the
  // client only ever sends one destination's fields.
  standaloneConcertSong?: boolean;
  // Set by the catalog worker only: no artist photo, album cover, or track
  // cover is fetched/assigned for this import — catalog-imported content is
  // always art-less until an admin uses the manual Artwork Editor. The
  // single-video quick-import job never sets this, so its existing
  // thumbnail-as-cover behavior is unchanged.
  skipArtwork?: boolean;
  // "Allow duplicate imports" — set by the catalog worker from the batch's
  // allowDuplicates flag (see routes/youtubeCatalogImport.ts). When true, an
  // existing track (by sourceId or fuzzy title match) or album (by title) is
  // never reused or skipped — this import always creates a brand-new row
  // instead. The single-video quick-import job never sets this, so it keeps
  // throwing DuplicateImportError on a match exactly as before.
  allowDuplicates?: boolean;
  // Required alongside allowDuplicates so re-imported album tracks within the
  // same batch land together in one new duplicate album — see
  // findOrCreateAlbum below.
  batchId?: string;
  onProgress?: (status: string, progress: number, message: string) => void;
  // Set by the catalog worker so a manually-cancelled item (the import
  // screen's per-item X button) actually kills the in-flight yt-dlp/ffmpeg
  // process instead of running to completion in the background. Checked at
  // a few cheap checkpoints too (see below) so a cancel requested during a
  // DB call rather than a yt-dlp call still takes effect promptly rather
  // than only being caught next time a spawn happens.
  signal?: AbortSignal;
}

function parseUploadDate(value: string | null): Date | undefined {
  if (!value || value.length !== 8) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Fetches a YouTube channel's own avatar/thumbnail and re-uploads it into
// Supabase Storage, so a newly-created artist gets a photo automatically as
// part of import. Best-effort only: any failure (channel listing error, no
// thumbnail, upload failure) resolves to undefined rather than throwing, so
// a missing avatar never fails the track import it's attached to.
async function fetchChannelAvatarUrl(channelUrl: string): Promise<string | undefined> {
  const candidates = await fetchChannelThumbnailCandidates(channelUrl);
  return await importBestReachableImage(candidates);
}

// The full download -> convert -> waveform -> upload -> save pipeline for a
// single YouTube video. Shared by the quick single-URL import job
// (youtube/importJob.ts) and the catalog batch worker
// (youtube/catalogWorker.ts) so the actual mechanics of turning a YouTube URL
// into a Track row live in exactly one place.
export async function importYoutubeVideo({
  url,
  adminId,
  albumId,
  genre,
  isSingle,
  titleOverride,
  artistNameOverride,
  createArtist,
  targetArtistId,
  albumTitle,
  albumType,
  trackNumber,
  skipArtwork,
  allowDuplicates,
  batchId,
  newConcert,
  concertYear,
  concertGenre,
  concertDescription,
  standaloneConcertSong,
  onProgress,
  signal,
}: ImportVideoParams) {
  let tmpDir: string | undefined;
  try {
    onProgress?.("pending", 0, "Fetching video info…");
    const metadata = await fetchYoutubeMetadata(url, signal);

    if (metadata.isLive) throw new Error("Live streams can't be imported");
    if (metadata.availability && !["public", "unlisted"].includes(metadata.availability)) {
      throw new Error(`This video is not publicly accessible (${metadata.availability})`);
    }

    // Artist is resolved up front (before the expensive download below) so
    // duplicate detection — both by sourceId and by fuzzy title match — can
    // be scoped to it, and so a duplicate is caught before wasting time
    // downloading/converting audio that will just be discarded.
    const channelUrl = metadata.channelUrl ? normalizeYoutubeChannelUrl(metadata.channelUrl) : null;
    const resolvedArtistName = artistNameOverride ?? metadata.uploader ?? metadata.channel ?? "Unknown Artist";
    const artist = targetArtistId
      ? // Explicit link — the admin picked this exact artist from the Edit
        // Metadata step's searchable list (or the catalog worker pinned it).
        await prisma.artist.findUniqueOrThrow({ where: { id: targetArtistId } }).catch(() => {
          throw new Error("Target artist not found");
        })
      : createArtist
        ? // Explicit opt-in from the Edit Metadata step: the typed name
          // matched no existing artist and the admin didn't pick one from
          // the list either, so create one — same as Album/Concert Album's
          // always-auto-create behavior, just deliberately chosen here.
          await findOrCreateArtist(resolvedArtistName, channelUrl ? () => fetchChannelAvatarUrl(channelUrl) : null)
        : // A Single never *automatically* creates an artist — it links to
          // an existing match by name, or stays unassigned (see
          // findExistingArtist). Every other destination (Album/Concert
          // Album, and catalog import) keeps the existing
          // auto-create-from-channel-name behavior.
          isSingle
          ? await findExistingArtist(resolvedArtistName)
          : await findOrCreateArtist(resolvedArtistName, channelUrl ? () => fetchChannelAvatarUrl(channelUrl) : null);

    const existingBySourceId = await prisma.track.findUnique({ where: { sourceId: metadata.id } });
    if (existingBySourceId && !allowDuplicates) throw new DuplicateImportError(metadata.id);
    // sourceId is @unique — when allow-duplicates is on and this exact video
    // was already imported, the new duplicate row can't reuse that same
    // sourceId, so it's dropped to null instead (it's only ever used for
    // dedup lookups, never displayed).
    const sourceIdForTrack = existingBySourceId && allowDuplicates ? null : metadata.id;

    // Catches the same song re-imported under a different YouTube video ID
    // (e.g. it was first pulled in as a standalone single, and later shows
    // up again inside a real album/playlist) — sourceId alone can't see
    // this since the video ID genuinely differs. Scoped to an actual artist,
    // so an unassigned Single (artist is null) skips this and relies on the
    // sourceId check above alone.
    if (!allowDuplicates && artist) {
      const artistTracks = await prisma.track.findMany({ where: { artistId: artist.id }, select: { title: true } });
      const titleDuplicate = artistTracks.some((t) => similarity(t.title, metadata.title) >= IDENTITY_MIN);
      if (titleDuplicate) throw new DuplicateImportError(metadata.id);
    }

    if (albumId) {
      const album = await prisma.album.findUnique({ where: { id: albumId } });
      if (!album) throw new Error("Album not found");
    }

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("downloading", 8, "Downloading audio…");
    tmpDir = await mkdtemp(path.join(tmpdir(), "mezmur-yt-"));
    const audioPath = await downloadYoutubeAudio(
      url,
      tmpDir,
      (percent) => {
        onProgress?.("downloading", 8 + Math.round(percent * 0.6), `Downloading audio… ${Math.round(percent)}%`);
      },
      signal
    );

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("processing", 70, "Generating waveform…");
    const waveform = await generateWaveform(audioPath);

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("uploading", 80, "Uploading audio to storage…");
    const audioBuffer = await readFile(audioPath);
    const audioStoragePath = `${randomUUID()}.mp3`;
    // audio-tracks' bucket policies only permit writes via a signed upload
    // token (see routes/admin.ts's upload-track route) — a direct
    // service-role .upload() gets rejected by row-level security, so we go
    // through the same signed-URL indirection here.
    const signedUrl = await createSignedAudioUploadUrl(audioStoragePath);
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: new Uint8Array(audioBuffer),
    });
    if (!putRes.ok) throw new Error(`Audio upload failed with status ${putRes.status}`);
    const { data: audioUrlData } = supabaseAdmin.storage.from("audio-tracks").getPublicUrl(audioStoragePath);

    let coverUrl: string | undefined;
    if (!skipArtwork) {
      onProgress?.("uploading", 90, "Uploading thumbnail…");
      coverUrl = await importImageFromUrl(metadata.thumbnail);
    }

    onProgress?.("saving", 95, "Saving track…");
    // albumTitle is only ever set by catalog import, which always resolves a
    // real artist (never the isSingle/findExistingArtist path above) — the
    // `artist &&` guard here is purely for the type checker. newConcert takes
    // priority: it's an explicit "create a brand-new concert" action, never a
    // find-or-reuse-by-title match the way albumTitle/findOrCreateAlbum is.
    const album =
      newConcert && artist
        ? await prisma.album.create({
            data: {
              title: titleOverride ?? metadata.title,
              artistId: artist.id,
              albumType: "live",
              year: concertYear,
              genre: concertGenre,
              description: concertDescription,
              gradientFrom: artist.gradientFrom,
              gradientTo: artist.gradientTo,
            },
          })
        : albumTitle && artist
          ? await findOrCreateAlbum(artist.id, albumTitle, {
              allowDuplicates,
              albumType,
              duplicateAlbumMap: batchId
                ? {
                    get: async () =>
                      (await prisma.youtubeImportBatch.findUniqueOrThrow({ where: { id: batchId } }))
                        .duplicateAlbumMap as Record<string, string> | null,
                    set: async (map) => {
                      await prisma.youtubeImportBatch.update({ where: { id: batchId }, data: { duplicateAlbumMap: map } });
                    },
                  }
                : undefined,
            })
          : undefined;

    const track = await prisma.track.create({
      data: {
        title: titleOverride ?? metadata.title,
        duration: metadata.duration ?? 0,
        genre,
        artistId: artist?.id,
        // Only meaningful when there's no real artist link — see
        // Track.artistNameOverride in schema.prisma.
        artistNameOverride: artist ? undefined : resolvedArtistName,
        albumId: album?.id ?? albumId,
        isSingle: Boolean(isSingle),
        isConcertSong: Boolean(standaloneConcertSong),
        trackNumber,
        audioUrl: audioUrlData.publicUrl,
        coverUrl: coverUrl ?? album?.coverUrl ?? undefined,
        sourceUrl: metadata.webpageUrl,
        sourceId: sourceIdForTrack,
        publishedAt: parseUploadDate(metadata.uploadDate),
        waveform: waveform ?? undefined,
      },
      include: { artist: true, album: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: "youtube_import",
        metadata: { trackId: track.id, videoId: metadata.id, url: metadata.webpageUrl, confirmedRights: true },
      },
    });

    onProgress?.("done", 100, "Done");
    return { track, dto: toTrackDTO(track) };
  } catch (err) {
    if (err instanceof DuplicateImportError) throw err;
    if (err instanceof YtDlpError) throw new Error(`Download failed: ${err.message}`);
    throw err;
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
}
