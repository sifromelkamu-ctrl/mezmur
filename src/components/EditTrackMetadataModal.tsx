import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { artistsApi, tracksApi, type ApiTrack } from "../lib/api";
import { emitTrackMetadataChanged } from "../lib/trackMetadataEvents";
import TextField from "./form/TextField";

interface EditTrackMetadataModalProps {
  track: ApiTrack;
  onClose: () => void;
  onSaved: () => void;
}

// Admin-only editor for a standalone single's title and artist name,
// opened from Now Playing (see canEditSingleMeta there). Deliberately
// scoped out for tracks that belong to an album — mirrors the existing
// artwork-edit rule ("Album Artwork Is Master Artwork") for the same
// reason: an album track's title/artist are catalog metadata best fixed
// from Admin Library Management, where the whole album is in view.
export default function EditTrackMetadataModal({ track, onClose, onSaved }: EditTrackMetadataModalProps) {
  const [title, setTitle] = useState(track.title);
  const [artistName, setArtistName] = useState(track.artistName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Artist name lives on the Artist row, not the track — renaming it here
  // renames that artist everywhere (their other singles/albums too), not
  // just this one track. A track imported with no artist match at all
  // (artistId null — see ApiTrack.artistId) has no artist row to rename,
  // so that field is read-only in that case.
  const canEditArtistName = Boolean(track.artistId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedArtist = artistName.trim();
    if (!trimmedTitle) return;

    setSaving(true);
    setError(null);
    try {
      const patch: { title?: string; artistName?: string } = {};

      if (trimmedTitle !== track.title) {
        await tracksApi.update(track.id, { title: trimmedTitle });
        patch.title = trimmedTitle;
      }
      if (canEditArtistName && track.artistId && trimmedArtist && trimmedArtist !== track.artistName) {
        await artistsApi.update(track.artistId, { name: trimmedArtist });
        patch.artistName = trimmedArtist;
      }

      if (patch.title !== undefined || patch.artistName !== undefined) {
        emitTrackMetadataChanged({ trackId: track.id, patch });
      }
      onSaved();
    } catch {
      setError("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-panel rounded-xl w-full max-w-sm p-5 relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Edit song details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Title</span>
            <TextField
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title"
              className="px-4 py-2.5 text-base w-full"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Artist name</span>
            <TextField
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Artist name"
              className="px-4 py-2.5 text-base w-full"
              disabled={!canEditArtistName}
            />
            {!canEditArtistName && (
              <span className="text-xs text-fg-subtle">
                This track has no linked artist to rename — fix it from Admin Library Management instead.
              </span>
            )}
          </label>

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="mt-2 bg-brand text-black font-bold rounded-full py-3 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
