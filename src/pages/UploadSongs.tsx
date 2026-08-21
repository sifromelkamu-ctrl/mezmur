import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Music2,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  X as XIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { ApiError, submissionsApi, type ApiSubmission, type SubmissionType } from "../lib/api";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TRACKS_PER_ALBUM = 50;

interface TrackDraft {
  key: string;
  title: string;
  audio: File | null;
  // Single-only — an album's tracks all share the album cover (see
  // routes/submissions.ts's zod schema, which only ever accepts artworkUrl
  // for a "single" submission).
  artwork: File | null;
}

function emptyTrack(): TrackDraft {
  return { key: crypto.randomUUID(), title: "", audio: null, artwork: null };
}

function ImagePicker({
  label,
  file,
  onPick,
  onClear,
  error,
}: {
  label: string;
  file: File | null;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: string;
}) {
  const inputId = useId();
  const previewUrl = file ? URL.createObjectURL(file) : null;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div>
      <label htmlFor={inputId} className="flex items-center gap-3 bg-panel rounded-md px-4 py-2.5 cursor-pointer">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
        ) : (
          <span className="w-9 h-9 rounded bg-elevated flex items-center justify-center text-fg-subtle shrink-0">
            <ImageIcon size={16} />
          </span>
        )}
        <span className="flex-1 text-sm truncate">{file ? file.name : label}</span>
        {file ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
            aria-label={`Remove ${label}`}
            className="text-fg-muted hover:text-fg transition-colors shrink-0"
          >
            <XIcon size={16} />
          </button>
        ) : (
          <Plus size={16} className="text-fg-muted shrink-0" />
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          onPick(picked);
        }}
      />
      {error && <p className="text-xs text-accent-red mt-1">{error}</p>}
    </div>
  );
}

function statusBadge(status: ApiSubmission["status"]) {
  if (status === "approved") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-brand">
        <ThumbsUp size={12} /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-accent-red">
        <ThumbsDown size={12} /> Rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-fg-muted">
      <Clock3 size={12} /> Pending review
    </span>
  );
}

export default function UploadSongs() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [type, setType] = useState<SubmissionType>("single");
  const [artistName, setArtistName] = useState("");
  const [artistPhoto, setArtistPhoto] = useState<File | null>(null);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumCover, setAlbumCover] = useState<File | null>(null);
  const [tracks, setTracks] = useState<TrackDraft[]>([emptyTrack()]);
  const [confirmRights, setConfirmRights] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [mine, setMine] = useState<ApiSubmission[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const loadMine = () => {
    if (!user) return;
    submissionsApi
      .mine()
      .then((r) => setMine(r.submissions))
      .finally(() => setLoadingMine(false));
  };

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const switchType = (next: SubmissionType) => {
    setType(next);
    setTracks([emptyTrack()]);
    setAlbumTitle("");
    setAlbumCover(null);
    setArtistPhoto(null);
    setError(null);
  };

  const pickImage = (file: File, apply: (f: File) => void) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That image is too large — please pick one under 5MB.");
      return;
    }
    setImageError(null);
    apply(file);
  };

  const updateTrack = (key: string, patch: Partial<TrackDraft>) => {
    setTracks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  };

  const removeTrack = (key: string) => {
    setTracks((prev) => (prev.length > 1 ? prev.filter((t) => t.key !== key) : prev));
  };

  const tracksReady = tracks.every((t) => t.title.trim() && t.audio) && (type === "single" ? tracks[0]?.artwork : true);
  const canSubmit =
    Boolean(artistName.trim()) &&
    confirmRights &&
    tracksReady &&
    (type === "single" ? tracks.length === 1 : Boolean(albumTitle.trim()) && Boolean(albumCover)) &&
    !submitting;

  const resetForm = () => {
    setArtistName("");
    setArtistPhoto(null);
    setAlbumTitle("");
    setAlbumCover(null);
    setTracks([emptyTrack()]);
    setConfirmRights(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let artistPhotoUrl: string | undefined;
      if (type === "album" && artistPhoto) {
        setProgress("Uploading artist photo…");
        artistPhotoUrl = (await submissionsApi.uploadImage(artistPhoto)).url;
      }
      let albumCoverUrl: string | undefined;
      if (type === "album" && albumCover) {
        setProgress("Uploading album art…");
        albumCoverUrl = (await submissionsApi.uploadImage(albumCover)).url;
      }

      const uploadedTracks: { title: string; audioUrl: string; artworkUrl?: string }[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const draft = tracks[i];
        setProgress(tracks.length > 1 ? `Uploading song ${i + 1} of ${tracks.length}…` : "Uploading song…");
        const dotIndex = draft.audio!.name.lastIndexOf(".");
        const ext = dotIndex !== -1 ? draft.audio!.name.slice(dotIndex) : undefined;
        const { signedUrl, publicUrl } = await submissionsApi.requestAudioUploadUrl(ext);
        await submissionsApi.putAudioFile(signedUrl, draft.audio!);

        let artworkUrl: string | undefined;
        if (type === "single" && draft.artwork) {
          setProgress("Uploading artwork…");
          artworkUrl = (await submissionsApi.uploadImage(draft.artwork)).url;
        }
        uploadedTracks.push({ title: draft.title.trim(), audioUrl: publicUrl, artworkUrl });
      }

      setProgress("Submitting…");
      await submissionsApi.submit({
        type,
        artistName: artistName.trim(),
        artistPhotoUrl,
        albumTitle: type === "album" ? albumTitle.trim() : undefined,
        albumCoverUrl,
        confirmRights: true,
        tracks: uploadedTracks,
      });

      resetForm();
      setJustSubmitted(true);
      loadMine();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit — please try again.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (!user) {
    return (
      <div className="px-6 pt-6 pb-28 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
            aria-label="Back"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-2xl font-bold">Upload Your Songs</h1>
        </div>
        <div className="bg-elevated rounded-lg p-6 flex flex-col items-center text-center gap-3">
          <UploadCloud size={28} className="text-fg-subtle" />
          <p className="text-sm text-fg-muted">Log in to submit your music for review.</p>
          <button
            onClick={() => navigate("/auth")}
            className="bg-brand text-black font-bold rounded-full px-6 py-2.5 text-sm hover:scale-105 transition-transform"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-28 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/settings")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Upload Your Songs</h1>
          <p className="text-sm text-fg-muted mt-1">Submit a single or a full album for review.</p>
        </div>
      </div>

      <div className="bg-elevated rounded-lg p-4 flex items-start gap-3 mb-6 text-sm text-fg-muted">
        <AlertCircle size={18} className="shrink-0 mt-0.5 text-accent-red" />
        <p>
          Only upload music you own or have the rights to distribute. An admin reviews every submission before it
          appears anywhere in the app.
        </p>
      </div>

      {justSubmitted && (
        <div className="bg-brand/10 ring-1 ring-brand/25 rounded-lg p-4 flex items-start gap-3 mb-6">
          <span className="w-9 h-9 rounded-full bg-brand/15 flex items-center justify-center text-brand shrink-0">
            <Check size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">Submitted for review</p>
            <p className="text-xs text-fg-muted mt-0.5">
              We'll let you know once an admin approves or rejects it — check back below.
            </p>
          </div>
          <button
            onClick={() => setJustSubmitted(false)}
            aria-label="Dismiss"
            className="ml-auto text-fg-muted hover:text-fg transition-colors shrink-0"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-8">
        <div className="flex bg-panel rounded-full p-1 w-fit">
          {(["single", "album"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              className={`px-5 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${
                type === t ? "bg-brand text-black" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <TextField
          type="text"
          required
          placeholder="Artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          variant="panel"
          className="px-4 py-2.5 text-base w-full"
        />

        {type === "album" && (
          <>
            <ImagePicker
              label="Artist photo (optional)"
              file={artistPhoto}
              onPick={(f) => pickImage(f, setArtistPhoto)}
              onClear={() => setArtistPhoto(null)}
            />
            <TextField
              type="text"
              required
              placeholder="Album title"
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
              variant="panel"
              className="px-4 py-2.5 text-base w-full"
            />
            <ImagePicker
              label="Album art"
              file={albumCover}
              onPick={(f) => pickImage(f, setAlbumCover)}
              onClear={() => setAlbumCover(null)}
              error={imageError ?? undefined}
            />
          </>
        )}

        <div className="flex flex-col gap-3">
          {tracks.map((track, i) => (
            <div key={track.key} className="bg-elevated rounded-lg p-3 flex flex-col gap-2">
              {type === "album" && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fg-muted">Song {i + 1}</span>
                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTrack(track.key)}
                      aria-label="Remove song"
                      className="text-fg-muted hover:text-accent-red transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
              <TextField
                type="text"
                required
                placeholder="Song title"
                value={track.title}
                onChange={(e) => updateTrack(track.key, { title: e.target.value })}
                variant="panel"
                className="px-4 py-2.5 text-base w-full"
              />
              <label className="flex items-center gap-3 bg-panel rounded-md px-4 py-2.5 cursor-pointer">
                <span className="w-9 h-9 rounded bg-elevated-hover flex items-center justify-center text-fg-subtle shrink-0">
                  <Music2 size={16} />
                </span>
                <span className="flex-1 text-sm truncate">{track.audio ? track.audio.name : "Audio file"}</span>
                {track.audio ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      updateTrack(track.key, { audio: null });
                    }}
                    aria-label="Remove audio file"
                    className="text-fg-muted hover:text-fg transition-colors shrink-0"
                  >
                    <XIcon size={16} />
                  </button>
                ) : (
                  <Plus size={16} className="text-fg-muted shrink-0" />
                )}
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = "";
                    if (picked) updateTrack(track.key, { audio: picked });
                  }}
                />
              </label>
              {type === "single" && (
                <ImagePicker
                  label="Artwork"
                  file={track.artwork}
                  onPick={(f) => pickImage(f, (file) => updateTrack(track.key, { artwork: file }))}
                  onClear={() => updateTrack(track.key, { artwork: null })}
                  error={imageError ?? undefined}
                />
              )}
            </div>
          ))}
        </div>

        {type === "album" && tracks.length < MAX_TRACKS_PER_ALBUM && (
          <button
            type="button"
            onClick={() => setTracks((prev) => [...prev, emptyTrack()])}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline w-fit"
          >
            <Plus size={16} /> Add another song
          </button>
        )}

        <label className="flex items-start gap-3 text-sm text-fg-muted mt-1">
          <input
            type="checkbox"
            checked={confirmRights}
            onChange={(e) => setConfirmRights(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          I own this music, or have explicit permission to upload and distribute it.
        </label>

        {error && <p className="text-sm text-accent-red">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? (progress ?? "Submitting…") : `Submit ${type}`}
        </button>
      </form>

      <div>
        <h2 className="text-sm font-bold text-fg-muted uppercase tracking-wide mb-3">Your submissions</h2>
        {loadingMine ? (
          <div className="flex items-center justify-center py-8 text-fg-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : mine.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing submitted yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mine.map((s) => (
              <div key={s.id} className="bg-elevated rounded-lg p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {s.type === "album" ? s.albumTitle : s.tracks[0]?.title} — {s.artistName}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 capitalize">
                    {s.type} · {s.tracks.length} song{s.tracks.length === 1 ? "" : "s"}
                    {s.reviewNote ? ` · ${s.reviewNote}` : ""}
                  </p>
                </div>
                {statusBadge(s.status)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
