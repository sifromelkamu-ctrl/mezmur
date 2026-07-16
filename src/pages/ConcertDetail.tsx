import { Check, Clock, Download, Heart, Pencil, Play, Share2, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import EditConcertModal from "../components/EditConcertModal";
import TrackRow from "../components/TrackRow";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { albumsApi, concertsApi, type ApiAlbum, type ApiAlbumDetail } from "../lib/api";
import { isConcertAlbumItem } from "../lib/concerts";
import { renderWithAmharicStyle } from "../utils/scriptText";

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

const FAVORITE_CONCERTS_KEY = "mezmur:favorite-concerts";

// A concert-level "like" — there's no album-level favorite concept anywhere
// else in the app (FavoritesContext is track-only), so this mirrors that
// same localStorage-backed pattern instead of extending a shared context
// every other favoriting surface depends on.
function loadFavoriteConcertIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITE_CONCERTS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export default function ConcertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { playTrack, shuffle, toggleShuffle } = usePlayer();
  const [concerts, setConcerts] = useState<ApiAlbum[]>([]);
  const [concert, setConcert] = useState<ApiAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteConcertIds());
  const [copied, setCopied] = useState(false);
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // The full concert list for the horizontal switcher — fetched once, not
  // re-fetched per concert, so switching between them never re-flashes it.
  // Re-called after an edit (rename/delete) so the strip picks up the
  // change immediately without a full page reload.
  // Standalone Concert Songs also come back in this feed (see
  // server/src/routes/concerts.ts) but never have a detail page of their
  // own — this switcher only ever links between real Concert Albums.
  const refreshConcertList = () => concertsApi.list().then((items) => setConcerts(items.filter(isConcertAlbumItem)));
  useEffect(() => {
    refreshConcertList();
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setConcert(null);
    albumsApi
      .get(id)
      .then(setConcert)
      .catch(() => setConcert(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Keeps the selected chip scrolled into view any time the selected
  // concert changes (including the initial load, once the list is in).
  useEffect(() => {
    if (!id) return;
    chipRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [id, concerts]);

  const isFavorite = id ? favoriteIds.has(id) : false;
  const toggleFavorite = () => {
    if (!id) return;
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAVORITE_CONCERTS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const handlePlay = () => {
    if (concert?.tracks[0]) playTrack(concert.tracks[0], concert.tracks);
  };

  const handleShuffle = () => {
    if (!concert || concert.tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = concert.tracks[Math.floor(Math.random() * concert.tracks.length)];
    playTrack(randomTrack, concert.tracks);
  };

  const handleShare = async () => {
    if (!concert || !id) return;
    const url = `${window.location.origin}${window.location.pathname}#/concert/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: concert.title, url });
        return;
      } catch {
        // user cancelled or share failed, fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // "if available" — only rendered when at least one track actually has
  // downloadable audio. No bulk-zip service exists (or is warranted here),
  // so this just triggers each track's own download in turn, staggered so
  // the browser doesn't treat a burst of same-tick downloads as a popup.
  const downloadableTracks = concert?.tracks.filter((t) => t.audioUrl) ?? [];
  const handleDownload = () => {
    downloadableTracks.forEach((t, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = t.audioUrl!;
        a.download = `${t.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  };

  if (loading && !concert) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Concert not found.
      </div>
    );
  }

  const totalDuration = concert.tracks.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div>
      <div className="relative px-6 pt-10 pb-2">
        <BackButton />
      </div>

      {concerts.length > 1 && (
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth px-6 pb-2 mb-4">
          {concerts.map((c) => {
            const active = c.id === id;
            return (
              <div
                key={c.id}
                ref={(el) => {
                  if (el) chipRefs.current.set(c.id, el);
                  else chipRefs.current.delete(c.id);
                }}
                onClick={() => !active && navigate(`/concert/${c.id}`)}
                className={`snap-center shrink-0 w-14 flex flex-col items-center gap-1.5 cursor-pointer transition-transform ${
                  active ? "scale-105" : "opacity-60 hover:opacity-100"
                }`}
              >
                <CoverArt
                  gradient={c.gradient}
                  size="sm"
                  photoUrl={c.coverUrl}
                  entityType="album"
                  entityId={c.id}
                  artworkFrame={c.artworkFrame}
                  hideEditButton
                  className={active ? "ring-2 ring-brand shadow-[0_0_14px_rgba(124,92,255,0.6)]" : ""}
                />
                <p className={`text-[10px] font-medium truncate w-14 text-center ${active ? "text-fg" : "text-fg-subtle"}`}>
                  {c.title}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="relative flex flex-col items-center text-center gap-4 px-6 pb-6"
        style={{
          backgroundImage: `linear-gradient(180deg, ${concert.gradient[0]}66, ${concert.gradient[1]}22)`,
        }}
      >
        <CoverArt
          gradient={concert.gradient}
          size="albumHero"
          photoUrl={concert.coverUrl}
          entityType="album"
          entityId={concert.id}
          artworkFrame={concert.artworkFrame}
          hideEditButton
        />
        <div className="min-w-0 w-full max-w-2xl">
          <div className="flex items-center justify-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide">Concert</p>
            {isAdmin && (
              <button
                onClick={() => setShowEditModal(true)}
                className="text-fg-muted hover:text-fg transition-colors"
                aria-label="Edit concert"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          <h1 className="text-3xl font-black tracking-tight mt-2 mb-4 break-words">
            {renderWithAmharicStyle(concert.title)}
          </h1>
          <p className="text-sm text-fg-muted">
            <span
              className="font-semibold text-fg hover:underline cursor-pointer"
              onClick={() => navigate(`/artist/${concert.artistId}`)}
            >
              {renderWithAmharicStyle(concert.artistName ?? "")}
            </span>{" "}
            {concert.year ? `· ${concert.year} ` : ""}· {concert.tracks.length} songs, {formatDuration(totalDuration)}
          </p>
          {concert.description && <p className="text-sm text-fg-muted max-w-2xl mt-3">{concert.description}</p>}
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlay}
            className="w-14 h-14 rounded-full bg-brand text-black flex items-center justify-center shadow-lg shadow-brand/30 hover:scale-110 hover:shadow-brand/50 transition-all"
            aria-label="Play concert"
          >
            <Play size={24} fill="black" className="ml-1" />
          </button>
          <button
            onClick={handleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
              shuffle ? "border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
            }`}
            aria-label="Shuffle concert"
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={toggleFavorite}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
              isFavorite ? "border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
            }`}
            aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
          </button>
          {downloadableTracks.length > 0 && (
            <button
              onClick={handleDownload}
              className="w-11 h-11 rounded-full flex items-center justify-center border border-border text-fg-muted hover:text-fg transition-colors"
              aria-label="Download concert"
            >
              <Download size={18} />
            </button>
          )}
          <button
            onClick={handleShare}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-border text-fg-muted hover:text-fg transition-colors"
            aria-label="Share concert"
          >
            {copied ? <Check size={18} className="text-brand" /> : <Share2 size={18} />}
          </button>
        </div>

        <div className="grid grid-cols-[24px_1fr_auto] items-center gap-4 px-4 py-2 text-xs text-fg-muted border-b border-border mb-2">
          <span>#</span>
          <span>Title</span>
          <span className="flex justify-end">
            <Clock size={14} />
          </span>
        </div>

        <div>
          {concert.tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i + 1} queue={concert.tracks} />
          ))}
        </div>
      </div>

      {showEditModal && (
        <EditConcertModal
          concert={concert}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setConcert(updated);
            refreshConcertList();
          }}
          onDeleted={() => navigate("/concerts")}
          onConvertedToAlbum={(albumId) => navigate(`/album/${albumId}`, { replace: true })}
        />
      )}
    </div>
  );
}
