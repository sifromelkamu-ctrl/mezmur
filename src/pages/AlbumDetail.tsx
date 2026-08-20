import { Check, Clock, Download, GripVertical, Pencil, Play, Shuffle, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import ArtworkEditor from "../components/ArtworkEditor";
import TrackRow from "../components/TrackRow";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { adminApi, albumsApi, type ApiAlbumDetail, type ApiAlbumType } from "../lib/api";
import { emitArtworkChanged } from "../lib/artworkEvents";
import { cachedDetailFetch } from "../lib/detailCache";

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

const ALBUM_TYPE_OPTIONS: { value: ApiAlbumType; label: string }[] = [
  { value: "album", label: "Album" },
  { value: "ep", label: "EP" },
  { value: "single", label: "Single" },
  { value: "live", label: "Concert Album" },
  { value: "compilation", label: "Compilation" },
];

export default function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, shuffle, toggleShuffle } = usePlayer();
  const [album, setAlbum] = useState<ApiAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", releaseDate: "", genre: "", albumType: "album" as ApiAlbumType });
  const [saving, setSaving] = useState(false);
  const [orderedTracks, setOrderedTracks] = useState<ApiAlbumDetail["tracks"]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showArtworkEditor, setShowArtworkEditor] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setAlbum(null);
    setEditing(false);
    cachedDetailFetch(`album:${id}`, () => albumsApi.get(id))
      .then((a) => {
        setAlbum(a);
        setOrderedTracks(a.tracks);
      })
      .catch(() => setAlbum(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!album) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Album not found.
      </div>
    );
  }

  const totalDuration = orderedTracks.reduce((sum, t) => sum + t.duration, 0);

  const handlePlay = () => {
    if (orderedTracks[0]) playTrack(orderedTracks[0], orderedTracks);
  };

  const handleShuffle = () => {
    if (orderedTracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = orderedTracks[Math.floor(Math.random() * orderedTracks.length)];
    playTrack(randomTrack, orderedTracks);
  };

  const startEditing = () => {
    setForm({
      title: album.title,
      description: album.description ?? "",
      releaseDate: album.releaseDate ?? "",
      genre: album.genre ?? "",
      albumType: album.albumType,
    });
    setEditing(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const updated = await albumsApi.update(album.id, {
        title: form.title.trim() || album.title,
        description: form.description.trim(),
        releaseDate: form.releaseDate || undefined,
        genre: form.genre.trim(),
        albumType: form.albumType,
      });
      setAlbum({ ...album, ...updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (file: File) => {
    const updated = await albumsApi.uploadCover(album.id, file);
    setAlbum({ ...album, coverUrl: updated.coverUrl, artworkFrame: undefined });
    emitArtworkChanged({ entityType: "album", entityId: album.id, patch: { coverUrl: updated.coverUrl, artworkFrame: null } });
  };

  const handleCoverRemove = async () => {
    const updated = await albumsApi.removeCover(album.id);
    setAlbum({ ...album, coverUrl: updated.coverUrl, artworkFrame: undefined });
    emitArtworkChanged({ entityType: "album", entityId: album.id, patch: { coverUrl: updated.coverUrl, artworkFrame: null } });
  };

  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = orderedTracks.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setOrderedTracks(next);
    setDragIndex(null);
    await albumsApi.reorder(
      album.id,
      next.map((t) => t.id)
    );
  };

  return (
    <div>
      <div
        className="relative flex flex-col items-center text-center gap-4 px-6 pb-6"
        style={{
          backgroundImage: `linear-gradient(180deg, ${album.gradient[0]}66, ${album.gradient[1]}22)`,
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 2.5rem)",
        }}
      >
        <BackButton variant="glass" />
        <div className="relative group">
          <CoverArt
            gradient={album.gradient}
            size="albumHero"
            photoUrl={album.coverUrl}
            entityType="album"
            entityId={album.id}
            artworkFrame={album.artworkFrame}
            hideEditButton
          />
          {isAdmin && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-md">
              {album.coverUrl && (
                <button
                  onClick={() => setShowArtworkEditor(true)}
                  className="w-11 h-11 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                  aria-label="Edit artwork framing"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                onClick={() => coverInputRef.current?.click()}
                className="w-11 h-11 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                aria-label="Upload or replace artwork"
              >
                <Upload size={16} />
              </button>
              {album.coverUrl && (
                <button
                  onClick={handleCoverRemove}
                  className="w-11 h-11 rounded-full bg-black/70 text-white flex items-center justify-center hover:scale-110 transition-transform"
                  aria-label="Remove artwork"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
              />
            </div>
          )}
        </div>
        {showArtworkEditor && album.coverUrl && (
          <ArtworkEditor
            photoUrl={album.coverUrl}
            initialFrame={album.artworkFrame}
            onClose={() => setShowArtworkEditor(false)}
            onSave={async (frame) => {
              await adminApi.setArtworkFrame("album", album.id, frame);
              setAlbum({ ...album, artworkFrame: frame });
              emitArtworkChanged({ entityType: "album", entityId: album.id, patch: { artworkFrame: frame } });
            }}
          />
        )}
        <div className="min-w-0 w-full max-w-2xl">
          {editing ? (
            <div className="text-left space-y-3 bg-elevated rounded-xl p-4">
              <div>
                <label className="text-xs text-fg-muted block mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-fg-muted block mb-1">Album type</label>
                  <select
                    value={form.albumType}
                    onChange={(e) => setForm((f) => ({ ...f, albumType: e.target.value as ApiAlbumType }))}
                    className="w-full bg-base rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
                  >
                    {ALBUM_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-fg-muted block mb-1">Release date</label>
                  <input
                    type="date"
                    value={form.releaseDate}
                    onChange={(e) => setForm((f) => ({ ...f, releaseDate: e.target.value }))}
                    className="w-full bg-base rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-fg-muted block mb-1">Genre</label>
                <input
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  placeholder="e.g. Gospel, Worship"
                  className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
                />
              </div>
              <div>
                <label className="text-xs text-fg-muted block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional album description"
                  className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-brand text-black text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
                >
                  <Check size={14} />
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg px-3 py-1.5"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide">
                  {album.albumType === "live" ? "Concert" : "Album"}
                </p>
                {isAdmin && (
                  <button onClick={startEditing} className="text-fg-muted hover:text-fg transition-colors" aria-label="Edit album">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <h1 className="text-3xl font-black tracking-tight mt-2 mb-4 break-words">{album.title}</h1>
              <p className="text-sm text-fg-muted">
                <span
                  className="font-semibold text-fg hover:underline cursor-pointer"
                  onClick={() => navigate(`/artist/${album.artistId}`)}
                >
                  {album.artistName}
                </span>{" "}
                {album.year ? `· ${album.year} ` : ""}· {orderedTracks.length} songs, {formatDuration(totalDuration)}
                {album.genre ? ` · ${album.genre}` : ""}
              </p>
              {album.description && <p className="text-sm text-fg-muted max-w-2xl mt-3">{album.description}</p>}
            </>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlay}
            className="w-14 h-14 rounded-full bg-brand text-black flex items-center justify-center shadow-lg shadow-brand/30 hover:scale-110 hover:shadow-brand/50 transition-all"
            aria-label="Play album"
          >
            <Play size={24} fill="black" className="ml-1" />
          </button>
          <button
            onClick={handleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
              shuffle ? "border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
            }`}
            aria-label="Shuffle album"
          >
            <Shuffle size={18} />
          </button>
          {album.albumType === "live" && (
            <button
              disabled
              title="Download coming soon"
              className="w-11 h-11 rounded-full flex items-center justify-center border border-border text-fg-subtle opacity-50 cursor-not-allowed"
              aria-label="Download (coming soon)"
            >
              <Download size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-4 px-4 py-2 text-xs text-fg-muted border-b border-border mb-2">
          <span>#</span>
          <span>Title</span>
          <span className="flex justify-end">
            <Clock size={14} />
          </span>
        </div>

        <div>
          {orderedTracks.map((track, i) => (
            <div
              key={track.id}
              draggable={isAdmin}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => isAdmin && e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={`flex items-center gap-1 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${
                dragIndex === i ? "opacity-40" : ""
              }`}
            >
              {isAdmin && <GripVertical size={14} className="text-fg-subtle shrink-0" />}
              <div className="flex-1 min-w-0">
                <TrackRow track={track} index={i + 1} queue={orderedTracks} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
