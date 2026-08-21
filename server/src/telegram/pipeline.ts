import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";
import { toTrackDTO } from "../routes/artists.js";
import { similarity } from "../artwork/matching.js";
import { getTelegramClient } from "./client.js";
import { downloadTelegramAudio } from "./download.js";
import { buildTelegramSourceId } from "./enumerate.js";
import { generateWaveform, getAudioDurationSeconds } from "../youtube/waveform.js";
import { CancelledImportError } from "../youtube/safeError.js";
import { createSignedAudioUploadUrl, DuplicateImportError, findOrCreateAlbum, IDENTITY_MIN } from "../catalogImport/shared.js";
import type { AlbumType } from "../generated/prisma/enums.js";

export { CancelledImportError, DuplicateImportError };

export interface ImportTelegramItemParams {
  channelUsername: string;
  messageId: string;
  title: string;
  duration: number | null;
  adminId: string;
  // Always required — unlike YouTube's single-video quick-import job (which
  // can leave a Single unassigned), Telegram import only ever runs through
  // the batch flow, which always resolves an explicit target artist up
  // front (see routes/telegramImport.ts's resolveTargetArtist call).
  targetArtistId: string;
  // Set only when the admin explicitly assigned this item to an album via
  // /assign-album — null (the enumerated default) means it imports as a
  // standalone Single, same convention as YouTube's ungrouped catalog items.
  albumTitle?: string | null;
  albumType?: AlbumType;
  allowDuplicates?: boolean;
  // Required alongside allowDuplicates so re-imported album tracks within
  // the same batch land together in one new duplicate album — see
  // findOrCreateAlbum in catalogImport/shared.ts.
  batchId?: string;
  onProgress?: (status: string, progress: number, message: string) => void;
  signal?: AbortSignal;
}

// The full download -> convert -> waveform -> upload -> save pipeline for one
// Telegram audio message. Structurally mirrors youtube/pipeline.ts's
// importYoutubeVideo, trimmed to what Telegram import actually needs: no
// title/artist auto-detection (the admin's explicit choices always win, and
// Telegram's own message metadata is passed in already-resolved rather than
// fetched here), and no artwork (Telegram audio rarely carries embedded art;
// like YouTube catalog import, tracks land art-less until the admin uses the
// manual Artwork Editor).
export async function importTelegramAudio({
  channelUsername,
  messageId,
  title,
  duration,
  adminId,
  targetArtistId,
  albumTitle,
  albumType,
  allowDuplicates,
  batchId,
  onProgress,
  signal,
}: ImportTelegramItemParams) {
  let tmpDir: string | undefined;
  try {
    onProgress?.("pending", 0, "Looking up message…");
    const client = await getTelegramClient();
    const entity = await client.getEntity(channelUsername);
    const channelId = String((entity as { id?: unknown }).id ?? channelUsername);
    const sourceId = buildTelegramSourceId(channelId, messageId);

    // Resolved up front (before the expensive download below) so duplicate
    // detection can be scoped to it, and so a duplicate is caught before
    // wasting time downloading/converting audio that will just be discarded.
    const artist = await prisma.artist.findUniqueOrThrow({ where: { id: targetArtistId } }).catch(() => {
      throw new Error("Target artist not found");
    });

    const existingBySourceId = await prisma.track.findUnique({ where: { sourceId } });
    if (existingBySourceId && !allowDuplicates) throw new DuplicateImportError(sourceId);
    // sourceId is @unique — when allow-duplicates is on and this exact
    // message was already imported, the new duplicate row can't reuse that
    // same sourceId, so it's dropped to null instead (only ever used for
    // dedup lookups, never displayed).
    const sourceIdForTrack = existingBySourceId && allowDuplicates ? null : sourceId;

    // Catches the same song re-imported from a different message (e.g.
    // re-posted in the channel) — sourceId alone can't see this since the
    // message id genuinely differs.
    if (!allowDuplicates) {
      const artistTracks = await prisma.track.findMany({ where: { artistId: artist.id }, select: { title: true } });
      const titleDuplicate = artistTracks.some((t) => similarity(t.title, title) >= IDENTITY_MIN);
      if (titleDuplicate) throw new DuplicateImportError(sourceId);
    }

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("downloading", 8, "Downloading audio…");
    tmpDir = await mkdtemp(path.join(tmpdir(), "mezmur-tg-"));
    const audioPath = await downloadTelegramAudio(
      channelUsername,
      messageId,
      tmpDir,
      (percent) => {
        onProgress?.("downloading", 8 + Math.round(percent * 0.6), `Downloading audio… ${Math.round(percent)}%`);
      },
      signal
    );

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("processing", 70, "Generating waveform…");
    const waveform = await generateWaveform(audioPath);
    // Telegram's own reported duration (see ImportTelegramItemParams above)
    // has been observed wildly wrong for some channels (a few seconds for a
    // genuinely 3-5 minute song) — measuring the actual downloaded file is
    // the only way to be sure the player's progress bar isn't lying.
    const realDuration = await getAudioDurationSeconds(audioPath);

    if (signal?.aborted) throw new CancelledImportError();

    onProgress?.("uploading", 80, "Uploading audio to storage…");
    const audioBuffer = await readFile(audioPath);
    const audioStoragePath = `${randomUUID()}.mp3`;
    // audio-tracks' bucket policies only permit writes via a signed upload
    // token — see youtube/pipeline.ts's identical comment for why.
    const signedUrl = await createSignedAudioUploadUrl(audioStoragePath);
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: new Uint8Array(audioBuffer),
    });
    if (!putRes.ok) throw new Error(`Audio upload failed with status ${putRes.status}`);
    const { data: audioUrlData } = supabaseAdmin.storage.from("audio-tracks").getPublicUrl(audioStoragePath);

    onProgress?.("saving", 95, "Saving track…");
    const album = albumTitle
      ? await findOrCreateAlbum(artist.id, albumTitle, {
          allowDuplicates,
          albumType,
          duplicateAlbumMap: batchId
            ? {
                get: async () =>
                  (await prisma.telegramImportBatch.findUniqueOrThrow({ where: { id: batchId } }))
                    .duplicateAlbumMap as Record<string, string> | null,
                set: async (map) => {
                  await prisma.telegramImportBatch.update({ where: { id: batchId }, data: { duplicateAlbumMap: map } });
                },
              }
            : undefined,
        })
      : undefined;

    const track = await prisma.track.create({
      data: {
        title,
        duration: realDuration ?? duration ?? 0,
        artistId: artist.id,
        albumId: album?.id,
        // No album assigned -> the same "Single" convention YouTube catalog
        // import uses for its own ungrouped items.
        isSingle: !album,
        audioUrl: audioUrlData.publicUrl,
        coverUrl: album?.coverUrl ?? undefined,
        sourceUrl: `https://t.me/${channelUsername}/${messageId}`,
        sourceId: sourceIdForTrack,
        waveform: waveform ?? undefined,
      },
      include: { artist: true, album: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: "telegram_import",
        metadata: { trackId: track.id, sourceId, channelUsername, messageId, confirmedRights: true },
      },
    });

    onProgress?.("done", 100, "Done");
    return { track, dto: toTrackDTO(track) };
  } catch (err) {
    if (err instanceof DuplicateImportError) throw err;
    throw err;
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
}
