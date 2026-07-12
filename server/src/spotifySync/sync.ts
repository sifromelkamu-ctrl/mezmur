import { prisma } from "../prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { similarity } from "../artwork/matching.js";
import { getSpotifyArtistAlbums, getSpotifyAlbumDetails, getSpotifyAlbumTracks, getSpotifyTracksPopularity } from "../artwork/spotify.js";
import type { SpotifySyncMode, ArtistSyncProgress, ArtistSyncSummary, SyncLogEntry } from "./types.js";

const IDENTITY_MIN = 0.55; // same bar used elsewhere (artwork/matching.ts) for fuzzy title matching

// Smart Merge only fills genuinely missing data and never touches a field
// that already has a value. Force/metadata_only overwrite unconditionally
// within their scope; albums_only never touches an existing row's fields at
// all (see runArtistSpotifySync for the per-mode rules). Artwork is never
// touched by any mode — the manual Album Artwork Editor is the only way to
// set or change artist photos and album covers.
function shouldApply(mode: SpotifySyncMode, current: unknown): boolean {
  if (mode === "smart") return current === null || current === undefined || current === "";
  return true;
}

const CAN_CREATE = new Set<SpotifySyncMode>(["smart", "force", "albums_only"]);
const CAN_UPDATE_METADATA = new Set<SpotifySyncMode>(["smart", "force", "metadata_only"]);

function log(entries: SyncLogEntry[], level: SyncLogEntry["level"], message: string) {
  entries.push({ level, message });
}

function mapSpotifyAlbumType(spotifyType: string, totalTracks?: number): "album" | "ep" | "single" | null {
  if (spotifyType === "single") return totalTracks && totalTracks >= 4 ? "ep" : "single";
  if (spotifyType === "album") return "album";
  if (spotifyType === "compilation") return "album";
  return null;
}

// Pulls every album/track directly from the one Spotify artist ID this
// local artist is manually linked to — never a name search, so a sync can
// never pull in another artist's release by mistake ("never guess another
// artist"). Imports albums, tracks, track order, release dates, album
// names, track metadata, and Spotify IDs only — never artist photos or
// album artwork; see runArtistSpotifySync's per-mode rules below.
export async function runArtistSpotifySync(
  artistId: string,
  mode: SpotifySyncMode,
  onProgress?: (progress: ArtistSyncProgress) => void
): Promise<ArtistSyncSummary> {
  const summary: ArtistSyncSummary = {
    albumsCreated: 0,
    albumsUpdated: 0,
    tracksCreated: 0,
    tracksUpdated: 0,
    fieldsUpdated: 0,
    log: [],
  };

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { albums: { include: { tracks: true } } },
  });
  if (!artist) throw new Error("Artist not found");
  if (!artist.spotifyId) throw new Error("Artist is not linked to Spotify");

  const spotifyAlbums = await getSpotifyArtistAlbums(artist.spotifyId);
  const totalAlbums = spotifyAlbums.length;
  let albumsDone = 0;

  for (const spotifyAlbum of spotifyAlbums) {
    albumsDone++;
    onProgress?.({ phase: "albums", done: albumsDone, total: totalAlbums });

    try {
      let localAlbum =
        artist.albums.find((a) => a.spotifyId === spotifyAlbum.id) ??
        artist.albums.find((a) => !a.spotifyId && similarity(a.title, spotifyAlbum.name) >= IDENTITY_MIN);

      const isNewAlbum = !localAlbum;
      if (isNewAlbum) {
        if (!CAN_CREATE.has(mode)) {
          log(summary.log, "skip", `Album "${spotifyAlbum.name}": not present locally, mode doesn't create albums`);
          continue;
        }
        localAlbum = await prisma.album.create({
          data: { title: spotifyAlbum.name, artistId: artist.id, spotifyId: spotifyAlbum.id },
          include: { tracks: true },
        });
        summary.albumsCreated++;
        log(summary.log, "info", `Created album "${spotifyAlbum.name}"`);
      }
      if (!localAlbum) continue;

      const data: Prisma.AlbumUpdateInput = {};
      let changed = false;
      if (localAlbum.spotifyId !== spotifyAlbum.id) {
        data.spotifyId = spotifyAlbum.id;
        changed = true;
      }

      if (mode !== "albums_only" && CAN_UPDATE_METADATA.has(mode)) {
        if (mode === "force" && spotifyAlbum.name !== localAlbum.title) {
          data.title = spotifyAlbum.name;
          changed = true;
        }
        if (shouldApply(mode, localAlbum.releaseDate) && spotifyAlbum.releaseDate) {
          const parsed = new Date(spotifyAlbum.releaseDate);
          if (!Number.isNaN(parsed.getTime())) {
            data.releaseDate = parsed;
            data.year = parsed.getFullYear();
            changed = true;
          }
        }
        if (mode === "force" && spotifyAlbum.albumType) {
          const mapped = mapSpotifyAlbumType(spotifyAlbum.albumType, spotifyAlbum.totalTracks);
          if (mapped) {
            data.albumType = mapped;
            changed = true;
          }
        }

        const details = await getSpotifyAlbumDetails(spotifyAlbum.id);
        if (details) {
          if (shouldApply(mode, localAlbum.recordLabel) && details.label) {
            data.recordLabel = details.label;
            changed = true;
          }
          if (shouldApply(mode, localAlbum.copyright) && details.copyrights.length > 0) {
            data.copyright = details.copyrights.join(" · ");
            changed = true;
          }
          if (shouldApply(mode, localAlbum.genre) && details.genres.length > 0) {
            data.genre = details.genres[0];
            changed = true;
          }
        }
      }

      if (changed) {
        if (!isNewAlbum) summary.albumsUpdated++;
        summary.fieldsUpdated++;
        await prisma.album.update({ where: { id: localAlbum.id }, data });
      }

      // --- Track-level sync ---
      const spotifyTracks = await getSpotifyAlbumTracks(spotifyAlbum.id);
      onProgress?.({ phase: "tracks", done: albumsDone, total: totalAlbums });

      let popularityById = new Map<string, number>();
      if (mode !== "albums_only") {
        popularityById = await getSpotifyTracksPopularity(spotifyTracks.map((t) => t.id));
      }

      for (const spotifyTrack of spotifyTracks) {
        try {
          let localTrack =
            localAlbum.tracks.find((t) => t.spotifyId === spotifyTrack.id) ??
            localAlbum.tracks.find((t) => !t.spotifyId && similarity(t.title, spotifyTrack.name) >= IDENTITY_MIN);

          const isNewTrack = !localTrack;
          if (isNewTrack) {
            if (!CAN_CREATE.has(mode)) continue;
            localTrack = await prisma.track.create({
              data: {
                title: spotifyTrack.name,
                artistId: artist.id,
                albumId: localAlbum.id,
                spotifyId: spotifyTrack.id,
                duration: spotifyTrack.durationMs ? Math.round(spotifyTrack.durationMs / 1000) : 0,
                trackNumber: spotifyTrack.trackNumber,
                discNumber: spotifyTrack.discNumber,
              },
            });
            summary.tracksCreated++;
            continue;
          }
          if (!localTrack || mode === "albums_only") continue;

          const tData: Prisma.TrackUpdateInput = {};
          let tChanged = false;
          if (localTrack.spotifyId !== spotifyTrack.id) {
            tData.spotifyId = spotifyTrack.id;
            tChanged = true;
          }
          if (mode === "force" && spotifyTrack.name !== localTrack.title) {
            tData.title = spotifyTrack.name;
            tChanged = true;
          }
          if (shouldApply(mode, localTrack.trackNumber) && spotifyTrack.trackNumber != null) {
            tData.trackNumber = spotifyTrack.trackNumber;
            tChanged = true;
          }
          if (shouldApply(mode, localTrack.discNumber) && spotifyTrack.discNumber != null) {
            tData.discNumber = spotifyTrack.discNumber;
            tChanged = true;
          }
          const popularity = popularityById.get(spotifyTrack.id);
          if (popularity != null && popularity !== localTrack.popularity) {
            tData.popularity = popularity;
            tChanged = true;
          }

          if (tChanged) {
            summary.tracksUpdated++;
            summary.fieldsUpdated++;
            await prisma.track.update({ where: { id: localTrack.id }, data: tData });
          }
        } catch (err) {
          log(summary.log, "error", `Track "${spotifyTrack.name}": ${err instanceof Error ? err.message : "sync failed"}`);
        }
      }
    } catch (err) {
      log(summary.log, "error", `Album "${spotifyAlbum.name}": ${err instanceof Error ? err.message : "sync failed"}`);
    }
  }

  onProgress?.({ phase: "done", done: totalAlbums, total: totalAlbums });
  return summary;
}
