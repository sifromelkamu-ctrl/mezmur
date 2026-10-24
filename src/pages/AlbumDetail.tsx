import { Check, Clock, Download, GripVertical, Heart, Link2, MoreHorizontal, Pencil, Play, Share2, Shuffle, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import defaultAlbumArt from "../assets/default-album-art.jpg";
import BackButton from "../components/BackButton";
import HeroTopScrim from "../components/HeroTopScrim";
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
  // Local-only, same as ArtistDetail's own "following" toggle — there's no
  // album-level favorites concept in the backend (FavoritesContext is
  // track-only), so this mirrors that existing precedent rather than
  // building a whole new persisted feature for a coloring/layout pass.
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [coverPhotoLoaded, setCoverPhotoLoaded] = useState(false);
  const [coverPhotoFailed, setCoverPhotoFailed] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setAlbum(null);
    setEditing(false);
    setLiked(false);
    setShowMenu(false);
    setCoverPhotoLoaded(false);
    setCoverPhotoFailed(false);
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

  const albumUrl = `${window.location.origin}${window.location.pathname}#/album/${album.id}`;
  const flashCopied = () => {
    setCopied(true);
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    copiedTimeout.current = setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: album.title, url: albumUrl });
        return;
      } catch {
        // user cancelled or share failed, fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(albumUrl);
    flashCopied();
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(albumUrl);
    setShowMenu(false);
    flashCopied();
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
    // Full-bleed cover photo hero, same structure/pattern as ArtistDetail's
    // own hero (see that file's comments for the full reasoning): photo
    // bleeds under the status bar, a wash tinted by this album's own
    // gradient darkens the bottom third for white-text legibility and
    // resolves to var(--color-base) — the app's root background, which
    // everything below the hero already sits on unstyled — so there's no
    // seam between the hero and the rest of the page. Admin cover controls
    // (upload/replace/recenter/remove) moved into the "..." menu instead of
    // a hover overlay on a small art card, since the art is now the whole
    // background rather than a discrete hoverable element.
    <div style={{ backgroundColor: album.gradient[1], marginTop: "calc(-1 * env(safe-area-inset-top))" }}>
      <div className="relative w-full overflow-hidden" style={{ height: "min(46vh, 380px)" }}>
        <div className="absolute inset-0">
          {album.coverUrl && !coverPhotoFailed ? (
            <img
              src={album.coverUrl}
              alt=""
              className={`w-full h-full object-cover transition-opacity duration-300 ${coverPhotoLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setCoverPhotoLoaded(true)}
              onError={() => setCoverPhotoFailed(true)}
            />
          ) : (
            <img src={defaultAlbumArt} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 48%, ${album.gradient[1]}4d 62%, ${album.gradient[1]}99 75%, ${album.gradient[1]}dd 90%, var(--color-base) 100%)`,
          }}
        />

        <HeroTopScrim />
        <BackButton variant="glass" />
        <div className="absolute top-[calc(env(safe-area-inset-top)+1.25rem)] right-4">
          <button
            onClick={() => setShowMenu((m) => !m)}
            className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-xl ring-1 ring-white/15 shadow-lg flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={20} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-elevated rounded-md shadow-2xl py-1 z-20">
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                >
                  <Link2 size={14} />
                  Copy link to album
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        startEditing();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                    >
                      <Pencil size={14} />
                      Edit album details
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        coverInputRef.current?.click();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                    >
                      <Upload size={14} />
                      Upload or replace cover
                    </button>
                    {album.coverUrl && (
                      <>
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowArtworkEditor(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                        >
                          <Pencil size={14} />
                          Edit artwork framing
                        </button>
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            handleCoverRemove();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                        >
                          <Trash2 size={14} />
                          Remove cover
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
          />
        </div>

        <div className="absolute bottom-0 inset-x-0 p-6">
          <span className="inline-flex items-center rounded-full border border-white/30 bg-black/30 backdrop-blur-sm px-3 py-1 mb-3 text-xs font-bold uppercase tracking-wide text-white">
            {album.albumType === "live" ? "Concert" : "Album"}
          </span>
          <h1 className="text-3xl font-black tracking-tight break-words text-white">{album.title}</h1>
          <p className="text-sm text-white/80 mt-1">
            <span
              className="font-semibold text-white hover:underline cursor-pointer"
              onClick={() => navigate(`/artist/${album.artistId}`)}
            >
              {album.artistName}
            </span>{" "}
            {album.year ? `· ${album.year} ` : ""}· {orderedTracks.length} songs, {formatDuration(totalDuration)}
          </p>
          {album.genre && (
            <div className="mt-2">
              <span className="inline-flex rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-white">
                {album.genre}
              </span>
            </div>
          )}
        </div>
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

      <div className="px-6 pt-6">
        {editing && (
          <div className="text-left space-y-3 bg-elevated rounded-xl p-4 mb-6">
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
        )}
        {!editing && album.description && <p className="text-sm text-fg-muted max-w-2xl mb-6">{album.description}</p>}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 bg-brand text-black font-bold rounded-full pl-5 pr-6 py-3 shadow-lg shadow-brand/30 hover:scale-105 transition-transform"
            aria-label="Play album"
          >
            <Play size={18} fill="black" />
            Play
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
          <button
            onClick={() => setLiked((l) => !l)}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
              liked ? "border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
            }`}
            aria-label={liked ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart size={17} fill={liked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleShare}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-border text-fg-muted hover:text-fg transition-colors"
            aria-label="Share album"
          >
            {copied ? <Check size={18} className="text-brand" /> : <Share2 size={18} />}
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
