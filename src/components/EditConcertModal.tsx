import { Check, GripVertical, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  adminApi,
  adminLibraryApi,
  albumsApi,
  artistsApi,
  type ApiAlbumDetail,
  type ApiArtist,
  type ArtworkFrame,
} from "../lib/api";
import { emitArtworkChanged } from "../lib/artworkEvents";
import ArtworkEditor from "./ArtworkEditor";
import CoverArt from "./CoverArt";

interface EditConcertModalProps {
  concert: ApiAlbumDetail;
  onClose: () => void;
  // Called after any successful save/track change with the freshly re-fetched
  // concert — lets ConcertDetail update its title/artwork/tracklist
  // immediately, with no re-import and no full page reload.
  onSaved: (updated: ApiAlbumDetail) => void;
  // Called after "Delete Concert" actually succeeds — the caller navigates
  // away, since this concert no longer exists.
  onDeleted: () => void;
}

export default function EditConcertModal({ concert, onClose, onSaved, onDeleted }: EditConcertModalProps) {
  const navigate = useNavigate();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [form, setForm] = useState({
    title: concert.title,
    artistId: concert.artistId,
    year: concert.year ? String(concert.year) : "",
    genre: concert.genre ?? "",
    description: concert.description ?? "",
  });
  const [tracks, setTracks] = useState(concert.tracks);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showArtworkEditor, setShowArtworkEditor] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverUrl, setCoverUrl] = useState(concert.coverUrl);
  const [artworkFrame, setArtworkFrame] = useState(concert.artworkFrame);
  const [error, setError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    artistsApi.list().then(setArtists);
  }, []);

  const refresh = async () => {
    const updated = await albumsApi.get(concert.id);
    setTracks(updated.tracks);
    onSaved(updated);
    return updated;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await albumsApi.update(concert.id, {
        title: form.title.trim() || concert.title,
        artistId: form.artistId !== concert.artistId ? form.artistId : undefined,
        year: form.year.trim() ? Number(form.year.trim()) : null,
        genre: form.genre.trim(),
        description: form.description.trim(),
      });
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const updated = await albumsApi.uploadCover(concert.id, file);
      setCoverUrl(updated.coverUrl);
      setArtworkFrame(undefined);
      emitArtworkChanged({ entityType: "album", entityId: concert.id, patch: { coverUrl: updated.coverUrl, artworkFrame: null } });
      await refresh();
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCoverRemove = async () => {
    const updated = await albumsApi.removeCover(concert.id);
    setCoverUrl(updated.coverUrl);
    setArtworkFrame(undefined);
    emitArtworkChanged({ entityType: "album", entityId: concert.id, patch: { coverUrl: updated.coverUrl, artworkFrame: null } });
    await refresh();
  };

  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = tracks.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setTracks(next);
    setDragIndex(null);
    await albumsApi.reorder(
      concert.id,
      next.map((t) => t.id)
    );
    await refresh();
  };

  const handleRemoveTrack = async (trackId: string) => {
    await adminLibraryApi.deleteTrack(trackId);
    await refresh();
  };

  const handleAddTracks = () => {
    navigate(`/admin/youtube-import?destination=live&albumId=${concert.id}`);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminLibraryApi.deleteAlbum(concert.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete concert");
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-panel rounded-xl w-full max-w-sm p-5 relative shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold">Edit Concert</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="relative group w-20 h-20 shrink-0">
              <CoverArt
                gradient={concert.gradient}
                size="md"
                photoUrl={coverUrl}
                entityType="album"
                entityId={concert.id}
                artworkFrame={artworkFrame}
                hideEditButton
                className="w-20 h-20"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-md">
                {coverUrl && (
                  <button
                    onClick={() => setShowArtworkEditor(true)}
                    className="w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Edit artwork framing"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  className="w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                  aria-label={coverUrl ? "Replace cover art" : "Add cover art"}
                >
                  <Upload size={12} />
                </button>
                {coverUrl && (
                  <button
                    onClick={handleCoverRemove}
                    className="w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Remove artwork"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-fg-muted">Tap the artwork to change it.</p>
          </div>

          {showArtworkEditor && coverUrl && (
            <ArtworkEditor
              photoUrl={coverUrl}
              initialFrame={artworkFrame}
              onClose={() => setShowArtworkEditor(false)}
              onSave={async (frame: ArtworkFrame) => {
                await adminApi.setArtworkFrame("album", concert.id, frame);
                setArtworkFrame(frame);
                emitArtworkChanged({ entityType: "album", entityId: concert.id, patch: { artworkFrame: frame } });
                await refresh();
                setShowArtworkEditor(false);
              }}
            />
          )}

          <div>
            <label className="text-xs text-fg-muted block mb-1">Concert Album Name</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
            />
          </div>

          <div>
            <label className="text-xs text-fg-muted block mb-1">Artist</label>
            <select
              value={form.artistId}
              onChange={(e) => setForm((f) => ({ ...f, artistId: e.target.value }))}
              className="w-full bg-base rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-muted block mb-1">Release Year</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                placeholder="Optional"
                className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
              />
            </div>
            <div>
              <label className="text-xs text-fg-muted block mb-1">Genre</label>
              <input
                value={form.genre}
                onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                placeholder="Optional"
                className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-fg-muted block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Optional concert description"
              className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border resize-none"
            />
          </div>

          {error && <p className="text-sm text-accent-red">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-brand text-black text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-60"
            >
              <Check size={14} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
                Tracks ({tracks.length})
              </p>
              <button
                onClick={handleAddTracks}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Plus size={13} />
                Add Tracks
              </button>
            </div>
            <div>
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  className={`flex items-center gap-2 py-1.5 cursor-grab active:cursor-grabbing ${
                    dragIndex === i ? "opacity-40" : ""
                  }`}
                >
                  <GripVertical size={14} className="text-fg-subtle shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-sm">{track.title}</span>
                  <button
                    onClick={() => handleRemoveTrack(track.id)}
                    className="text-fg-subtle hover:text-accent-red transition-colors shrink-0"
                    aria-label={`Remove ${track.title}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            {confirmDelete ? (
              <div className="bg-accent-red/10 rounded-lg p-3">
                <p className="text-sm text-fg mb-3">
                  Delete "{concert.title}" and all {tracks.length} of its tracks? This can't be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-accent-red text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete Concert"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-sm text-fg-muted hover:text-fg px-3 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-accent-red hover:underline"
              >
                <Trash2 size={14} />
                Delete Concert
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
