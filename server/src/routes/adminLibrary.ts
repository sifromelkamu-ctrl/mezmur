import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { toAlbumDTO } from "./artists.js";
import type { Prisma } from "../generated/prisma/client.js";

// Admin-only "Library Management" tools: reassigning a song's album/artist,
// moving/merging albums, and deleting catalog songs/albums. Everything that
// was already possible through the existing artist/album/track routes
// (rename, description, artwork, etc.) is left untouched and reused as-is
// by the frontend — this file only adds what didn't exist anywhere yet.
const router = Router();

router.use(isAdmin);

function logAudit(adminId: string, action: string, metadata?: Prisma.InputJsonValue) {
  return prisma.auditLog.create({ data: { adminId, action, metadata } });
}

interface AdminTrackRow {
  id: string;
  title: string;
  duration: number;
  language: string | null;
  genre: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
  artworkFrame?: unknown;
  trackNumber: number | null;
  discNumber: number | null;
  artistId: string | null;
  artistNameOverride?: string | null;
  albumId: string | null;
  isSingle: boolean;
  isConcertSong: boolean;
  publishedAt: Date | null;
  lyrics: string | null;
  artist: { name: string; gradientFrom: string; gradientTo: string } | null;
  album: {
    title: string;
    gradientFrom: string | null;
    gradientTo: string | null;
    coverUrl?: string | null;
    artworkFrame?: unknown;
  } | null;
}

// Local DTO (distinct from artists.ts's toTrackDTO) so the shared file
// doesn't need to change shape just to carry the two fields this admin
// screen needs (lyrics, releaseYear) that no other screen reads. Still
// follows the same "Album Artwork Is Master Artwork" rule as toTrackDTO —
// see that function for why.
function toAdminTrackDTO(track: AdminTrackRow) {
  const gradient: [string, string] = track.album?.gradientFrom
    ? [track.album.gradientFrom, track.album.gradientTo ?? "#111111"]
    : [track.artist?.gradientFrom ?? "#333333", track.artist?.gradientTo ?? "#111111"];
  const coverUrl = track.albumId ? track.album?.coverUrl : track.coverUrl;
  const artworkFrame = track.albumId ? track.album?.artworkFrame : track.artworkFrame;
  return {
    id: track.id,
    title: track.title,
    duration: track.duration,
    language: track.language,
    genre: track.genre ?? undefined,
    audioUrl: track.audioUrl ?? undefined,
    coverUrl: coverUrl ?? undefined,
    trackNumber: track.trackNumber ?? undefined,
    discNumber: track.discNumber ?? undefined,
    artistId: track.artistId,
    artistName: track.artist?.name ?? track.artistNameOverride ?? undefined,
    albumId: track.albumId,
    albumTitle: track.album?.title,
    // Only meaningful while the track has no album (see Track.isSingle/
    // isConcertSong in schema.prisma) — the "Category" selector in the Edit
    // Song form reads these to show the track's current standalone kind.
    isSingle: track.isSingle,
    isConcertSong: track.isConcertSong,
    releaseYear: track.publishedAt ? track.publishedAt.getUTCFullYear() : undefined,
    lyrics: track.lyrics ?? undefined,
    gradient,
    artworkFrame: artworkFrame ?? undefined,
  };
}

// GET /api/admin/library/tracks/:id - full admin detail for the "Edit Song"
// form, including the fields (lyrics, releaseYear) that the regular
// track/album DTOs don't carry.
router.get("/tracks/:id", async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({
    where: { id: String(req.params.id) },
    include: { artist: true, album: true },
  });
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  res.json(toAdminTrackDTO(track));
});

const editTrackSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  albumId: z.string().min(1).nullable().optional(),
  artistId: z.string().min(1).optional(),
  trackNumber: z.number().int().positive().nullable().optional(),
  discNumber: z.number().int().positive().nullable().optional(),
  genre: z.string().trim().max(60).optional(),
  language: z.string().trim().max(60).optional(),
  releaseYear: z.number().int().min(1900).max(2100).nullable().optional(),
  lyrics: z.string().trim().max(20000).nullable().optional(),
  // The Edit Song form's "Category" selector, shown only while the track has
  // no album — mutually exclusive (see Track.isConcertSong in
  // schema.prisma); setting either one always clears the other and detaches
  // any album, since both only ever mean "standalone."
  isSingle: z.boolean().optional(),
  isConcertSong: z.boolean().optional(),
});

// PATCH /api/admin/library/tracks/:id - the full "Edit Song" form: title,
// album, artist, track/disc number, release year, genre, lyrics. Keeps the
// artist/album relationship consistent - a provided albumId must belong to
// the resolved artist, and changing artistId without an explicit new album
// clears the album if it no longer belongs to the new artist.
router.patch("/tracks/:id", async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({ where: { id: String(req.params.id) } });
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  const parsed = editTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const data = parsed.data;
  const targetArtistId = data.artistId ?? track.artistId;

  if (data.artistId) {
    const artist = await prisma.artist.findUnique({ where: { id: data.artistId } });
    if (!artist) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }
  }

  let albumIdUpdate: string | null | undefined;
  if (data.albumId !== undefined) {
    if (data.albumId === null) {
      albumIdUpdate = null;
    } else {
      const album = await prisma.album.findUnique({ where: { id: data.albumId } });
      if (!album || album.artistId !== targetArtistId) {
        res.status(400).json({ error: "That album doesn't belong to the selected artist" });
        return;
      }
      albumIdUpdate = data.albumId;
    }
  } else if (data.artistId && data.artistId !== track.artistId && track.albumId) {
    const currentAlbum = await prisma.album.findUnique({ where: { id: track.albumId } });
    if (!currentAlbum || currentAlbum.artistId !== targetArtistId) {
      albumIdUpdate = null;
    }
  }

  // Marking a track Single or Concert Song only ever means "standalone" —
  // both force it off any album regardless of what else was sent, and each
  // one clears the other (see Track.isConcertSong in schema.prisma).
  if (data.isConcertSong === true) {
    albumIdUpdate = null;
  } else if (data.isSingle === true) {
    albumIdUpdate = null;
  }

  const updateData: Prisma.TrackUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.artistId !== undefined) updateData.artist = { connect: { id: data.artistId } };
  if (albumIdUpdate !== undefined) {
    updateData.album = albumIdUpdate ? { connect: { id: albumIdUpdate } } : { disconnect: true };
  }
  if (data.trackNumber !== undefined) updateData.trackNumber = data.trackNumber;
  if (data.discNumber !== undefined) updateData.discNumber = data.discNumber;
  if (data.genre !== undefined) updateData.genre = data.genre;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.releaseYear !== undefined) {
    updateData.publishedAt = data.releaseYear === null ? null : new Date(Date.UTC(data.releaseYear, 0, 1));
  }
  if (data.lyrics !== undefined) updateData.lyrics = data.lyrics;
  if (data.isConcertSong === true) {
    updateData.isConcertSong = true;
    updateData.isSingle = false;
  } else if (data.isSingle === true) {
    updateData.isSingle = true;
    updateData.isConcertSong = false;
  } else {
    if (data.isConcertSong !== undefined) updateData.isConcertSong = data.isConcertSong;
    if (data.isSingle !== undefined) updateData.isSingle = data.isSingle;
  }

  const updated = await prisma.track.update({
    where: { id: track.id },
    data: updateData,
    include: { artist: true, album: true },
  });
  await logAudit(req.userId!, "admin_edit_track", { trackId: track.id, changes: data });
  res.json(toAdminTrackDTO(updated));
});

const moveTracksSchema = z.object({
  trackIds: z.array(z.string().min(1)).min(1),
  destinationAlbumId: z.string().min(1),
});

// POST /api/admin/library/tracks/move - bulk "Move to Album". Syncs artistId
// to the destination album's artist so a track never ends up pointing at an
// album belonging to a different artist. Appends moved tracks after the
// destination's existing tracks rather than renumbering them.
router.post("/tracks/move", async (req: AuthedRequest, res) => {
  const parsed = moveTracksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { trackIds, destinationAlbumId } = parsed.data;

  const destAlbum = await prisma.album.findUnique({ where: { id: destinationAlbumId } });
  if (!destAlbum) {
    res.status(404).json({ error: "Destination album not found" });
    return;
  }

  const tracks = await prisma.track.findMany({ where: { id: { in: trackIds } } });
  if (tracks.length !== trackIds.length) {
    res.status(400).json({ error: "One or more tracks not found" });
    return;
  }

  const existingCount = await prisma.track.count({ where: { albumId: destinationAlbumId } });

  await prisma.$transaction(
    trackIds.map((id, index) =>
      prisma.track.update({
        where: { id },
        data: { albumId: destinationAlbumId, artistId: destAlbum.artistId, trackNumber: existingCount + index + 1 },
      })
    )
  );

  await logAudit(req.userId!, "admin_move_tracks", { trackIds, destinationAlbumId });

  const album = await prisma.album.findUnique({ where: { id: destinationAlbumId }, include: { artist: true } });
  res.json({ movedCount: trackIds.length, album: toAlbumDTO(album!) });
});

// DELETE /api/admin/library/tracks/:id - removes the catalog row only. The
// audio file in Supabase Storage is intentionally left in place; deleting
// shared storage objects is out of scope and irreversible.
router.delete("/tracks/:id", async (req: AuthedRequest, res) => {
  const track = await prisma.track.findUnique({ where: { id: String(req.params.id) } });
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  await prisma.track.delete({ where: { id: track.id } });
  await logAudit(req.userId!, "admin_delete_track", { trackId: track.id, title: track.title });
  res.status(204).end();
});

const mergeAlbumsSchema = z.object({
  sourceAlbumId: z.string().min(1),
  targetAlbumId: z.string().min(1),
});

// POST /api/admin/library/albums/merge - moves every track from source into
// target (never duplicates or deletes a track row), copies the source cover
// onto target only if target has none, then removes the now-empty source
// album.
router.post("/albums/merge", async (req: AuthedRequest, res) => {
  const parsed = mergeAlbumsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { sourceAlbumId, targetAlbumId } = parsed.data;
  if (sourceAlbumId === targetAlbumId) {
    res.status(400).json({ error: "Source and target albums must be different" });
    return;
  }

  const [source, target] = await Promise.all([
    prisma.album.findUnique({ where: { id: sourceAlbumId }, include: { tracks: true } }),
    prisma.album.findUnique({ where: { id: targetAlbumId } }),
  ]);
  if (!source || !target) {
    res.status(404).json({ error: "Album not found" });
    return;
  }

  const existingCount = await prisma.track.count({ where: { albumId: targetAlbumId } });

  await prisma.$transaction([
    ...source.tracks.map((t, index) =>
      prisma.track.update({
        where: { id: t.id },
        data: { albumId: targetAlbumId, artistId: target.artistId, trackNumber: existingCount + index + 1 },
      })
    ),
    ...(!target.coverUrl && source.coverUrl
      ? [prisma.album.update({ where: { id: targetAlbumId }, data: { coverUrl: source.coverUrl } })]
      : []),
    prisma.album.delete({ where: { id: sourceAlbumId } }),
  ]);

  await logAudit(req.userId!, "admin_merge_albums", {
    sourceAlbumId,
    targetAlbumId,
    movedTracks: source.tracks.length,
  });

  const merged = await prisma.album.findUnique({ where: { id: targetAlbumId }, include: { artist: true } });
  res.json(toAlbumDTO(merged!));
});

// DELETE /api/admin/library/albums/:id - removes the album AND every track
// in it. Track.albumId is onDelete: SetNull at the schema level (so other
// code paths, like reassigning a track elsewhere, never accidentally take
// its tracks down with it) — this route explicitly deletes the tracks
// first, in the same transaction, rather than relying on that default,
// since an admin deleting an album here wants it gone entirely, not left
// behind as orphaned singles.
router.delete("/albums/:id", async (req: AuthedRequest, res) => {
  const album = await prisma.album.findUnique({ where: { id: String(req.params.id) } });
  if (!album) {
    res.status(404).json({ error: "Album not found" });
    return;
  }
  const [deletedTracks] = await prisma.$transaction([
    prisma.track.deleteMany({ where: { albumId: album.id } }),
    prisma.album.delete({ where: { id: album.id } }),
  ]);
  await logAudit(req.userId!, "admin_delete_album", {
    albumId: album.id,
    title: album.title,
    tracksDeleted: deletedTracks.count,
  });
  res.status(204).end();
});

// DELETE /api/admin/library/artists/:id - removes the artist. The schema's
// FKs cascade from here: Album.artistId and Track.artistId are both
// onDelete: Cascade, so every album and track by this artist is deleted
// too (unlike DELETE /albums/:id, which only orphans its tracks) — and
// since PlaylistTrack.trackId also cascades, those tracks disappear from
// any playlist that included them. Irreversible; the client shows a strong
// warning before calling this.
router.delete("/artists/:id", async (req: AuthedRequest, res) => {
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  await prisma.artist.delete({ where: { id: artist.id } });
  await logAudit(req.userId!, "admin_delete_artist", { artistId: artist.id, name: artist.name });
  res.status(204).end();
});

export default router;
