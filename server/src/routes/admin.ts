import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { isAdmin, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";
import { toAlbumDTO, toArtistDTO, toTrackDTO } from "./artists.js";
import { toPlaylistDTO } from "./playlists.js";
import { uploadImageToStorage, upload } from "../upload.js";
import {
  searchSpotifyArtist,
  extractSpotifyArtistId,
  getSpotifyArtistById,
  SpotifyApiError,
  SpotifyNetworkError,
  type SpotifyArtistMatch,
} from "../artwork/spotify.js";
import { runArtistSpotifySync } from "../spotifySync/sync.js";
import type { SpotifySyncMode, ArtistSyncProgress, ArtistSyncSummary } from "../spotifySync/types.js";
import { Prisma } from "../generated/prisma/client.js";
import { normalizeForMatch } from "../artwork/matching.js";
import { findOrCreateArtist, findOrCreateAlbum } from "../catalogImport/shared.js";
import { notifyUserPush } from "../push.js";

const router = Router();

// Every route in this file is admin-only.
router.use(isAdmin);

function logAudit(adminId: string, action: string, metadata?: Prisma.InputJsonValue) {
  return prisma.auditLog.create({ data: { adminId, action, metadata } });
}

const GRADIENT_PALETTE: [string, string][] = [
  ["#f2b705", "#c2410c"],
  ["#0ea5e9", "#1e3a8a"],
  ["#22c55e", "#065f46"],
  ["#ec4899", "#701a75"],
  ["#f97316", "#7c2d12"],
  ["#a855f7", "#312e81"],
  ["#14b8a6", "#134e4a"],
  ["#f43f5e", "#4c0519"],
];

export function gradientForSeed(seed: string): [string, string] {
  let hash = 0;
  for (const ch of seed) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_PALETTE[hash % GRADIENT_PALETTE.length];
}

const createCatalogArtistSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// POST /api/admin/artists — creates a real catalog artist (ownerId: null),
// visible to every listener via GET /api/artists. This is distinct from the
// regular POST /api/artists route, which creates a *personal* artist scoped
// to the requesting user (ownerId: that user) and never appears in the
// public catalog — exactly the distinction an admin adding official,
// licensed catalog content needs.
router.post("/artists", async (req: AuthedRequest, res) => {
  const parsed = createCatalogArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  // Same duplicate-name guard the YouTube catalog import uses (see
  // routes/youtubeCatalogImport.ts's resolveTargetArtist) — hard-blocked
  // rather than silently creating a near-duplicate catalog artist, since
  // unlike YouTube import there's no channel URL here to disambiguate two
  // genuinely different people who happen to share a name.
  const catalogArtists = await prisma.artist.findMany({ where: { ownerId: null }, select: { id: true, name: true } });
  const normalizedInput = normalizeForMatch(parsed.data.name);
  const existing = catalogArtists.find((a) => normalizeForMatch(a.name) === normalizedInput);
  if (existing) {
    res.status(409).json({
      error: `An artist named "${existing.name}" already exists — choose it from the list instead, or use a different name.`,
      suggestedArtist: existing,
    });
    return;
  }
  const [gradientFrom, gradientTo] = gradientForSeed(parsed.data.name);
  const artist = await prisma.artist.create({
    data: { name: parsed.data.name, gradientFrom, gradientTo },
  });
  await logAudit(req.userId!, "create_catalog_artist", { artistId: artist.id, name: artist.name });
  res.status(201).json(toArtistDTO(artist));
});

const createCatalogAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Chosen up front at creation time — "live" is how a release is marked as
  // a Concert Album (see Home's Concerts section / GET /api/concerts, both
  // of which filter on this same field). Defaults to "album" so every
  // existing caller that doesn't pass it keeps behaving exactly as before.
  albumType: z.enum(["album", "ep", "single", "live", "compilation"]).default("album"),
});

// POST /api/admin/artists/:id/albums — same catalog-vs-personal distinction
// as above, for albums under a catalog artist.
router.post("/artists/:id/albums", async (req: AuthedRequest, res) => {
  const parsed = createCatalogAlbumSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  // Exact normalized-title match only — deliberately NOT fuzzy. Fuzzy
  // similarity (as used by the YouTube import pipeline's findOrCreateAlbum,
  // which is matching auto-derived titles against each other at scale) is
  // exactly wrong here: real album titles very often differ by nothing but
  // a number ("Vol 1" vs "Vol 2", "Part 1" vs "Part 2"), which scores as a
  // near-duplicate under edit-distance + token-overlap similarity (e.g.
  // "vol 1"/"vol 2" = 0.65, above the 0.55 bar those other call sites use)
  // even though they're obviously different releases. An admin manually
  // creating one album at a time needs the narrow "did I mistype/retype the
  // exact same title" check, not "does this look similar to something else."
  const existingAlbums = await prisma.album.findMany({ where: { artistId: artist.id }, select: { id: true, title: true } });
  const normalizedInputTitle = normalizeForMatch(parsed.data.title);
  const duplicate = existingAlbums.find((a) => normalizeForMatch(a.title) === normalizedInputTitle);
  if (duplicate) {
    res.status(409).json({
      error: `${artist.name} already has an album called "${duplicate.title}" — choose it from the list instead, or use a different title.`,
      suggestedAlbum: duplicate,
    });
    return;
  }
  const album = await prisma.album.create({
    data: {
      title: parsed.data.title,
      albumType: parsed.data.albumType,
      artistId: artist.id,
      gradientFrom: artist.gradientFrom,
      gradientTo: artist.gradientTo,
    },
  });
  await logAudit(req.userId!, "create_catalog_album", { albumId: album.id, artistId: artist.id, title: album.title });
  res.status(201).json(toAlbumDTO(album));
});

const uploadTrackSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artistId: z.string().min(1),
  albumId: z.string().min(1).optional(),
  genre: z.string().trim().max(60).optional(),
  duration: z.number().int().positive().max(3600),
  fileExt: z
    .string()
    .trim()
    .regex(/^\.?[a-zA-Z0-9]{1,5}$/, "Invalid file extension")
    .optional(),
  // Only meaningful alongside albumId — lets a whole-album-folder bulk
  // upload preserve track order without a separate reorder step afterward
  // (see AdminUpload.tsx's folder picker, which parses this from each
  // filename's leading number).
  trackNumber: z.number().int().positive().max(999).optional(),
  // Deliberate tag, not inferred from albumId being absent — same
  // "explicit, not implied" rule GET /api/singles documents (a track can
  // end up without an album for reasons that have nothing to do with being
  // a single). AdminUpload.tsx only ever sends this alongside an empty
  // albumId, but it's still enforced server-side below rather than trusted
  // as-is.
  isSingle: z.boolean().optional(),
});

// POST /api/admin/upload-track
//
// Cloud storage integration point: rather than routing the (potentially
// large) audio file through this server's memory, we ask Supabase Storage
// for a one-time signed upload URL and hand it straight back to the client.
// The browser then uploads the file bytes directly to Supabase, bypassing
// this server entirely — this is what keeps memory usage flat regardless of
// how large the audio file is.
router.post("/upload-track", async (req: AuthedRequest, res) => {
  const parsed = uploadTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { title, artistId, albumId, genre, duration, fileExt, trackNumber, isSingle } = parsed.data;
  // Marking a track a Single only ever means "standalone" — forces it off
  // any album regardless of what else was sent, mirroring the same rule
  // adminLibrary.ts's PATCH route already enforces for edits.
  const effectiveAlbumId = isSingle ? undefined : albumId;

  try {
    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) {
      res.status(404).json({ error: "Artist not found" });
      return;
    }
    if (effectiveAlbumId) {
      const album = await prisma.album.findUnique({ where: { id: effectiveAlbumId } });
      if (!album || album.artistId !== artistId) {
        res.status(404).json({ error: "Album not found for this artist" });
        return;
      }
    }

    const ext = fileExt ? (fileExt.startsWith(".") ? fileExt : `.${fileExt}`) : ".mp3";
    const path = `${randomUUID()}${ext}`;

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("audio-tracks")
      .createSignedUploadUrl(path);
    if (signError || !signed) {
      res.status(500).json({ error: signError?.message ?? "Could not create upload URL" });
      return;
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("audio-tracks").getPublicUrl(path);

    const track = await prisma.track.create({
      data: {
        title,
        artistId,
        albumId: effectiveAlbumId,
        genre,
        duration,
        audioUrl: publicUrlData.publicUrl,
        trackNumber: effectiveAlbumId ? trackNumber : undefined,
        isSingle: Boolean(isSingle),
      },
      include: { artist: true, album: true },
    });

    await logAudit(req.userId!, "upload_track", { trackId: track.id, title, artistId, albumId: effectiveAlbumId });

    res.status(201).json({
      track: toTrackDTO(track),
      upload: { signedUrl: signed.signedUrl, token: signed.token, path },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Track upload failed" });
  }
});

const uploadCoverTargetSchema = z.object({
  trackId: z.string().min(1).optional(),
  albumId: z.string().min(1).optional(),
});

// POST /api/admin/upload-cover
//
// Cover images are small enough to buffer safely in memory for one request
// (see upload.ts's multer.memoryStorage()), so this route accepts the file
// directly and uploads the buffer to the `album-art` bucket itself, rather
// than using the signed-URL indirection used for audio.
router.post("/upload-cover", upload.single("cover"), async (req: AuthedRequest, res) => {
  const parsedTarget = uploadCoverTargetSchema.safeParse(req.body);
  if (!parsedTarget.success) {
    res.status(400).json({ error: parsedTarget.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { trackId, albumId } = parsedTarget.data;
  if (!trackId && !albumId) {
    res.status(400).json({ error: "Provide either trackId or albumId" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded" });
    return;
  }

  try {
    const coverUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype);

    if (trackId) {
      const track = await prisma.track.findUnique({ where: { id: trackId } });
      if (!track) {
        res.status(404).json({ error: "Track not found" });
        return;
      }
      // Album Artwork Is Master Artwork: a track that belongs to an album
      // has no artwork of its own to replace — its cover always mirrors the
      // album's. Upload to the album instead.
      if (track.albumId) {
        res.status(400).json({ error: "This song's artwork is managed by its album — edit the album's artwork instead." });
        return;
      }
      const updated = await prisma.track.update({
        where: { id: trackId },
        data: { coverUrl, artworkFrame: Prisma.JsonNull },
        include: { artist: true, album: true },
      });
      await logAudit(req.userId!, "upload_cover", { trackId, coverUrl });
      res.json({ track: toTrackDTO(updated) });
      return;
    }

    const album = await prisma.album.findUnique({ where: { id: albumId! } });
    if (!album) {
      res.status(404).json({ error: "Album not found" });
      return;
    }
    // Every track under this album picks up the new cover instantly —
    // toTrackDTO always reads it live from the album, so there's nothing to
    // propagate onto track rows.
    const updated = await prisma.album.update({
      where: { id: albumId! },
      data: { coverUrl, artworkFrame: Prisma.JsonNull },
    });
    await logAudit(req.userId!, "upload_cover", { albumId, coverUrl });
    res.json({ album: toAlbumDTO(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Cover upload failed" });
  }
});

const updateUserSchema = z
  .object({
    role: z.enum(["user", "artist", "admin"]).optional(),
    suspended: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.suspended !== undefined, {
    message: "Provide at least one of role or suspended",
  });

// PUT /api/admin/users/:id - promote/demote a user's role, or suspend/unsuspend their account
router.put("/users/:id", async (req: AuthedRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const targetId = String(req.params.id);

  try {
    const profile = await prisma.profile.findUnique({ where: { id: targetId } });
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (parsed.data.role) {
      await prisma.profile.update({ where: { id: targetId }, data: { role: parsed.data.role } });
      await logAudit(req.userId!, "update_role", { targetId, role: parsed.data.role });
    }

    if (parsed.data.suspended !== undefined) {
      // Supabase's ban mechanism takes a duration rather than a boolean;
      // ~100 years is used as a practical "indefinite" suspension, and
      // "none" lifts it — the same convention Supabase's own dashboard uses.
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
        ban_duration: parsed.data.suspended ? "876000h" : "none",
      });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      await logAudit(req.userId!, parsed.data.suspended ? "suspend_user" : "unsuspend_user", { targetId });
    }

    const updated = await prisma.profile.findUniqueOrThrow({ where: { id: targetId } });
    res.json({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

function toUserAccessDTO(profile: {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  name: string | null;
  role: string;
  subscriptionStatus: string;
  trialEndsAt: Date;
}) {
  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone,
    username: profile.username,
    name: profile.name,
    role: profile.role,
    subscriptionStatus: profile.subscriptionStatus,
    trialEndsAt: profile.trialEndsAt,
  };
}

// GET /api/admin/users/search?q=... - finds accounts by email/username to
// grant/revoke free access on (see /users/:id/free-access below). There's
// no general user-management screen yet — this exists purely to locate a
// specific account by the one thing an admin is likely to have on hand.
router.get("/users/search", async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ users: [] });
    return;
  }
  const profiles = await prisma.profile.findMany({
    where: {
      OR: [{ email: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }],
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: profiles.map(toUserAccessDTO) });
});

const setFreeAccessSchema = z.object({ enabled: z.boolean() });

// POST /api/admin/users/:id/free-access - grants or revokes a permanent,
// admin-only "comped" override (no Stripe subscription involved at all —
// see the SubscriptionStatus.comped comment in schema.prisma). Refuses to
// touch an account with a real, Stripe-driven status so this can't
// accidentally clobber someone's actual paid subscription; granting is
// only meaningful starting from "none" or an existing comp, and revoking
// just drops back to "none" (ordinary trial-or-preview gating resumes).
router.post("/users/:id/free-access", async (req: AuthedRequest, res) => {
  const parsed = setFreeAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const targetId = String(req.params.id);
  const profile = await prisma.profile.findUnique({ where: { id: targetId } });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (parsed.data.enabled) {
    if (profile.subscriptionStatus !== "none" && profile.subscriptionStatus !== "comped") {
      res.status(400).json({ error: "This account already has a real subscription — leave it as-is." });
      return;
    }
    await prisma.profile.update({ where: { id: targetId }, data: { subscriptionStatus: "comped" } });
    await logAudit(req.userId!, "grant_free_access", { targetId });
  } else {
    if (profile.subscriptionStatus === "comped") {
      await prisma.profile.update({ where: { id: targetId }, data: { subscriptionStatus: "none" } });
      await logAudit(req.userId!, "revoke_free_access", { targetId });
    }
  }

  const updated = await prisma.profile.findUniqueOrThrow({ where: { id: targetId } });
  res.json({ user: toUserAccessDTO(updated) });
});

// --- Contact Us submissions (Settings > Contact Us, see routes/contact.ts
// for the public submit endpoint) ---

// GET /api/admin/contact-messages - newest first, no pagination (a "write
// us" inbox, not expected to reach a volume where that matters).
router.get("/contact-messages", async (_req: AuthedRequest, res) => {
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ messages });
});

// PATCH /api/admin/contact-messages/:id - toggle read/new so the inbox can
// show what's actually still unhandled.
const updateContactMessageSchema = z.object({ status: z.enum(["new", "read"]) });
router.patch("/contact-messages/:id", async (req: AuthedRequest, res) => {
  const parsed = updateContactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const message = await prisma.contactMessage
    .update({ where: { id: String(req.params.id) }, data: { status: parsed.data.status } })
    .catch(() => null);
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  res.json({ message });
});

router.delete("/contact-messages/:id", async (req: AuthedRequest, res) => {
  await prisma.contactMessage.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).end();
});

// PATCH /api/admin/contact-messages/:id/reply - in-app reply, only ever
// actually deliverable when the message has a userId (a guest sender has no
// session to push to or "Your messages" list to show it in — the admin UI
// falls back to the existing mailto: link for those). Still saves the reply
// text either way, mainly so the admin has a record of what was said.
const replyContactMessageSchema = z.object({ reply: z.string().trim().min(1).max(5000) });
router.patch("/contact-messages/:id/reply", async (req: AuthedRequest, res) => {
  const parsed = replyContactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const message = await prisma.contactMessage.update({
    where: { id: String(req.params.id) },
    data: { adminReply: parsed.data.reply, repliedAt: new Date(), status: "read" },
  }).catch(() => null);
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (message.userId) {
    void notifyUserPush(message.userId, {
      title: "Reply to your message",
      body: parsed.data.reply.slice(0, 140),
      url: "/#/settings",
    });
  }

  res.json({ message });
});

// --- Song submissions (Settings > Upload Your Songs, see
// routes/submissions.ts for the public submit endpoint) ---

// GET /api/admin/submissions - newest first, optional ?status= filter.
router.get("/submissions", async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const submissions = await prisma.songSubmission.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tracks: { orderBy: { position: "asc" } }, profile: { select: { email: true, name: true } } },
  });
  res.json({ submissions });
});

// POST /api/admin/submissions/:id/approve - creates the real catalog rows
// (Artist/Album/Track) from a pending submission's already-uploaded files
// and metadata, then marks it approved. The only path in this file that
// turns a submission into something a listener can actually see — reuses
// the same findOrCreateArtist/findOrCreateAlbum matching every catalog-
// import pipeline goes through, so a submitted artist/album name that
// matches an existing one is added to it rather than spawning a duplicate.
router.post("/submissions/:id/approve", async (req: AuthedRequest, res) => {
  const submission = await prisma.songSubmission.findUnique({
    where: { id: String(req.params.id) },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }
  if (submission.status !== "pending") {
    res.status(400).json({ error: `This submission was already ${submission.status}` });
    return;
  }

  const artist = await findOrCreateArtist(
    submission.artistName,
    submission.artistPhotoUrl ? async () => submission.artistPhotoUrl! : null
  );

  let albumId: string | undefined;
  if (submission.type === "album") {
    const album = await findOrCreateAlbum(artist.id, submission.albumTitle!);
    // findOrCreateAlbum never assigns artwork itself (catalog imports don't
    // have any to give it) — this submission does, so backfill it here, but
    // only if the matched/created album doesn't already have one, same
    // never-overwrite-existing-art caution the rest of the app follows.
    if (!album.coverUrl && submission.albumCoverUrl) {
      await prisma.album.update({ where: { id: album.id }, data: { coverUrl: submission.albumCoverUrl } });
    }
    albumId = album.id;
  }

  for (const track of submission.tracks) {
    const created = await prisma.track.create({
      data: {
        title: track.title,
        artistId: artist.id,
        albumId,
        trackNumber: albumId ? track.position + 1 : undefined,
        audioUrl: track.audioUrl,
        // Album Artwork Is Master Artwork: an album track never gets its own
        // coverUrl, same rule every other import pipeline follows.
        coverUrl: albumId ? undefined : (track.artworkUrl ?? undefined),
        isSingle: submission.type === "single",
      },
    });
    await prisma.songSubmissionTrack.update({ where: { id: track.id }, data: { createdTrackId: created.id } });
  }

  const updated = await prisma.songSubmission.update({
    where: { id: submission.id },
    data: { status: "approved", reviewedAt: new Date(), createdArtistId: artist.id, createdAlbumId: albumId ?? null },
    include: { tracks: { orderBy: { position: "asc" } } },
  });

  await logAudit(req.userId!, "approve_song_submission", { submissionId: submission.id, artistId: artist.id, albumId });

  res.json({ submission: updated });
});

const rejectSubmissionSchema = z.object({ reviewNote: z.string().trim().max(500).optional() });

// POST /api/admin/submissions/:id/reject
router.post("/submissions/:id/reject", async (req: AuthedRequest, res) => {
  const parsed = rejectSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const submission = await prisma.songSubmission.findUnique({ where: { id: String(req.params.id) } });
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }
  if (submission.status !== "pending") {
    res.status(400).json({ error: `This submission was already ${submission.status}` });
    return;
  }
  const updated = await prisma.songSubmission.update({
    where: { id: submission.id },
    data: { status: "rejected", reviewedAt: new Date(), reviewNote: parsed.data.reviewNote ?? null },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  res.json({ submission: updated });
});

// DELETE /api/admin/submissions/:id - history cleanup only, same as contact
// messages' delete: never touches whatever catalog content an approval may
// have already created (Track/Album/Artist rows have no FK back to this).
router.delete("/submissions/:id", async (req: AuthedRequest, res) => {
  await prisma.songSubmission.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).end();
});

// --- Artwork framing (Universal Artwork System's admin editor) ---
// Stores only presentation metadata (pan/zoom/rotation/flip) describing how
// to frame the *existing* photoUrl/coverUrl within a square — never touches
// the original image. Applies uniformly across every artwork-bearing model
// via one generic route rather than four near-identical ones.
const artworkFrameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(0.1).max(8),
  rotation: z.number().min(-180).max(180),
  flipH: z.boolean(),
  flipV: z.boolean(),
});

const setArtworkFrameSchema = z.object({
  entityType: z.enum(["artist", "album", "track", "playlist"]),
  entityId: z.string().min(1),
  frame: artworkFrameSchema.nullable(),
});

// PATCH /api/admin/artwork-frame - save (or, with frame: null, clear back to
// the smart-framing default) an artwork's manual crop/pan/zoom/rotation.
router.patch("/artwork-frame", async (req: AuthedRequest, res) => {
  const parsed = setArtworkFrameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { entityType, entityId, frame } = parsed.data;
  const artworkFrame = frame ?? Prisma.JsonNull;

  try {
    let dto: unknown;
    switch (entityType) {
      case "artist": {
        const updated = await prisma.artist.update({ where: { id: entityId }, data: { artworkFrame } });
        dto = toArtistDTO(updated);
        break;
      }
      case "album": {
        // Every track under this album picks up the new frame instantly —
        // toTrackDTO always reads it live from the album, so there's
        // nothing to propagate onto track rows.
        const updated = await prisma.album.update({ where: { id: entityId }, data: { artworkFrame } });
        dto = toAlbumDTO(updated);
        break;
      }
      case "track": {
        // Album Artwork Is Master Artwork: a track that belongs to an album
        // has no framing of its own to adjust — it always mirrors the
        // album's. Re-frame the album instead.
        const existing = await prisma.track.findUnique({ where: { id: entityId } });
        if (!existing) {
          res.status(404).json({ error: "Track not found" });
          return;
        }
        if (existing.albumId) {
          res.status(400).json({ error: "This song's artwork is managed by its album — edit the album's artwork instead." });
          return;
        }
        const updated = await prisma.track.update({
          where: { id: entityId },
          data: { artworkFrame },
          include: { artist: true, album: true },
        });
        dto = toTrackDTO(updated);
        break;
      }
      case "playlist": {
        const updated = await prisma.playlist.update({ where: { id: entityId }, data: { artworkFrame } });
        dto = toPlaylistDTO(updated);
        break;
      }
    }
    await logAudit(req.userId!, "set_artwork_frame", { entityType, entityId, cleared: frame === null });
    res.json({ [entityType]: dto });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save artwork frame" });
  }
});

// --- Manual Spotify artist linking ---
// Deliberately never a bulk/library-wide action: an admin explicitly
// confirms the one correct Spotify artist per local artist, and every sync
// afterward pulls only from that linked ID's own catalog (see
// runArtistSpotifySync) — never a name search, so it can't drift to a
// different artist.
function toArtistSearchDTO(a: SpotifyArtistMatch) {
  const bestImage = [...a.images].sort((x, y) => y.width * y.height - x.width * x.height)[0];
  return {
    id: a.id,
    name: a.name,
    imageUrl: bestImage?.url,
    followers: a.followers,
    popularity: a.popularity,
    genres: a.genres,
    externalUrl: a.externalUrl,
  };
}

// Maps the typed errors thrown by the search/lookup layer in
// artwork/spotify.ts to a response — so a rate limit or network failure
// never gets displayed to the admin as a misleading "not found".
const DEFAULT_RETRY_AFTER_SECONDS = 30;

function sendSpotifyError(res: import("express").Response, err: unknown) {
  if (err instanceof SpotifyApiError) {
    if (err.status === 429) {
      const retryAfter = err.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
      res.status(429).json({ error: "Spotify rate limit reached.", retryAfter });
      return;
    }
    res.status(502).json({ error: `Spotify search failed (status ${err.status}).` });
    return;
  }
  if (err instanceof SpotifyNetworkError) {
    res.status(502).json({ error: "Unable to connect to Spotify." });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Spotify request failed" });
}

router.get("/spotify/search-artist", async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }
  try {
    const matches = await searchSpotifyArtist(q);
    res.json({ results: matches.map(toArtistSearchDTO) });
  } catch (err) {
    sendSpotifyError(res, err);
  }
});

const resolveArtistSchema = z.object({ input: z.string().trim().min(1) });

router.post("/spotify/resolve-artist", async (req: AuthedRequest, res) => {
  const parsed = resolveArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const id = extractSpotifyArtistId(parsed.data.input);
  if (!id) {
    res.status(404).json({ error: "Not a recognizable Spotify artist URL/URI/ID" });
    return;
  }
  try {
    const match = await getSpotifyArtistById(id);
    if (!match) {
      res.status(404).json({ error: "Spotify artist not found" });
      return;
    }
    res.json({ result: toArtistSearchDTO(match) });
  } catch (err) {
    sendSpotifyError(res, err);
  }
});

const linkArtistSchema = z.object({ spotifyArtistId: z.string().trim().min(1) });

router.post("/artists/:id/spotify-link", async (req: AuthedRequest, res) => {
  const parsed = linkArtistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  let match: SpotifyArtistMatch | null;
  try {
    match = await getSpotifyArtistById(parsed.data.spotifyArtistId);
  } catch (err) {
    sendSpotifyError(res, err);
    return;
  }
  if (!match) {
    res.status(404).json({ error: "Spotify artist not found" });
    return;
  }
  try {
    const updated = await prisma.artist.update({
      where: { id: String(req.params.id) },
      data: { spotifyId: match.id, spotifyLastSyncedAt: null, spotifyLastSyncError: null },
    });
    await logAudit(req.userId!, "link_spotify_artist", { artistId: updated.id, spotifyArtistId: match.id });
    res.json({ artist: toArtistDTO(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to link artist" });
  }
});

router.delete("/artists/:id/spotify-link", async (req: AuthedRequest, res) => {
  try {
    const updated = await prisma.artist.update({
      where: { id: String(req.params.id) },
      data: { spotifyId: null, spotifyLastSyncedAt: null, spotifyLastSyncError: null },
    });
    await logAudit(req.userId!, "unlink_spotify_artist", { artistId: updated.id });
    res.json({ artist: toArtistDTO(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to unlink artist" });
  }
});

// --- Artist-scoped Spotify catalog sync ---
// Runs entirely in memory like the artwork reprocess job above (re-running
// is always safe, so losing progress on a server restart is a non-issue —
// just start it again).
const syncModeSchema = z.object({
  mode: z.enum(["smart", "force", "metadata_only", "albums_only"]),
});

interface ArtistSyncJob {
  id: string;
  artistId: string;
  status: "running" | "done";
  progress: ArtistSyncProgress;
  summary: ArtistSyncSummary | null;
  error?: string;
}
const syncJobs = new Map<string, ArtistSyncJob>();

router.post("/artists/:id/spotify-sync", async (req: AuthedRequest, res) => {
  const parsed = syncModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const artistId = String(req.params.id);
  const mode: SpotifySyncMode = parsed.data.mode;

  const jobId = randomUUID();
  const job: ArtistSyncJob = {
    id: jobId,
    artistId,
    status: "running",
    progress: { phase: "albums", done: 0, total: 0 },
    summary: null,
  };
  syncJobs.set(jobId, job);

  runArtistSpotifySync(artistId, mode, (progress) => {
    job.progress = progress;
  })
    .then(async (summary) => {
      job.summary = summary;
      job.status = "done";
      await prisma.artist.update({ where: { id: artistId }, data: { spotifyLastSyncedAt: new Date(), spotifyLastSyncError: null } });
      await logAudit(req.userId!, "spotify_artist_sync", {
        artistId,
        mode,
        albumsCreated: summary.albumsCreated,
        albumsUpdated: summary.albumsUpdated,
        tracksCreated: summary.tracksCreated,
        tracksUpdated: summary.tracksUpdated,
        fieldsUpdated: summary.fieldsUpdated,
      });
    })
    .catch(async (err) => {
      job.status = "done";
      job.error = err instanceof Error ? err.message : "Sync failed";
      await prisma.artist.update({ where: { id: artistId }, data: { spotifyLastSyncError: job.error } }).catch(() => {});
    });

  res.json({ jobId });
});

router.get("/spotify-sync/:jobId", (req: AuthedRequest, res) => {
  const job = syncJobs.get(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

export default router;
