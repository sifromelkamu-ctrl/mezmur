import {
  Heart,
  ImagePlus,
  Info,
  ListMusic,
  ListPlus,
  Loader2,
  Mic2,
  Moon,
  Pause,
  Pencil,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useFavorites } from "../context/FavoritesContext";
import { useLyricsSetting } from "../context/LyricsContext";
import { usePlayer } from "../context/PlayerContext";
import { useSleepTimer } from "../context/SleepTimerContext";
import { adminApi, type ArtworkFrame } from "../lib/api";
import { emitArtworkChanged } from "../lib/artworkEvents";
import { formatDuration } from "../utils/format";
import AddToPlaylistModal from "./AddToPlaylistModal";
import ArtworkEditor from "./ArtworkEditor";
import CoverArt from "./CoverArt";
import LyricsPanel from "./LyricsPanel";
import QueuePanel from "./QueuePanel";
import SleepTimerSheet from "./SleepTimerSheet";

interface NowPlayingProps {
  onClose: () => void;
  initialLyrics?: boolean;
}

// Scrolls its text horizontally only when it doesn't fit in one line —
// short titles just sit still, matching how Spotify/Apple Music do it.
function MarqueeTitle({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    setOverflowing(false);
    const raf = requestAnimationFrame(() => {
      if (containerRef.current && textRef.current) {
        setOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <div ref={containerRef} className="overflow-hidden whitespace-nowrap">
      <span
        ref={textRef}
        className={`text-2xl font-bold ${overflowing ? "marquee-text" : "inline-block truncate max-w-full"}`}
      >
        {text}
      </span>
    </div>
  );
}

const SWIPE_DISMISS_THRESHOLD = 90;
const SWIPE_SKIP_THRESHOLD = 60;
const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 300;

export default function NowPlaying({ onClose, initialLyrics = false }: NowPlayingProps) {
  const {
    currentTrack,
    queue,
    isPlaying,
    progress,
    shuffle,
    repeat,
    togglePlay,
    next,
    prev,
    seek,
    toggleShuffle,
    toggleRepeat,
    playTrack,
  } = usePlayer();
  const { lyricsEnabled } = useLyricsSetting();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { remainingLabel } = useSleepTimer();
  const [showLyrics, setShowLyrics] = useState(initialLyrics);
  const [showQueue, setShowQueue] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showSongInfo, setShowSongInfo] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showArtworkEditor, setShowArtworkEditor] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Admin-only, and only for a standalone Single — a track that belongs to
  // an album has no artwork of its own (Album Artwork Is Master Artwork:
  // the album's own cover is what CoverArt shows here already, via
  // readOnlyArtwork below), so there's nothing of its own to add or replace.
  const canEditSingleCover = user?.role === "admin" && Boolean(currentTrack) && !currentTrack?.albumId;

  const handleCoverFilePick = async (file: File) => {
    if (!currentTrack) return;
    setUploadingCover(true);
    try {
      const { track: updated } = await adminApi.uploadCover(file, { trackId: currentTrack.id });
      emitArtworkChanged({
        entityType: "track",
        entityId: currentTrack.id,
        patch: { coverUrl: updated?.coverUrl ?? null, artworkFrame: null },
      });
    } finally {
      setUploadingCover(false);
    }
  };

  // Opened via our own always-visible button below rather than CoverArt's
  // built-in edit pencil, which only reveals on CSS :hover — invisible on a
  // touchscreen phone, which is what this whole app targets. Same recenter/
  // zoom/rotate/flip editor and save path CoverArt itself uses internally.
  const handleArtworkFrameSave = async (frame: ArtworkFrame) => {
    if (!currentTrack) return;
    await adminApi.setArtworkFrame("track", currentTrack.id, frame);
    emitArtworkChanged({ entityType: "track", entityId: currentTrack.id, patch: { artworkFrame: frame } });
  };

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const longPressFired = useRef(false);
  const sheetTouchStart = useRef<{ x: number; y: number } | null>(null);
  const artworkSlotRef = useRef<HTMLDivElement>(null);
  const [artworkSize, setArtworkSize] = useState(0);

  // The artwork slot is a flex-1 region whose height varies with whatever
  // song info/controls need below it, so a square (and therefore a true
  // circle, not an oval) can't be expressed with aspect-ratio CSS alone —
  // aspect-ratio only holds when the height side is unconstrained, but here
  // both width and height are separately constrained by layout. Measuring
  // the slot and picking the smaller side guarantees a perfect square.
  //
  // Capping at 84% of the slot's width (Spotify-style proportions, rather
  // than edge-to-edge) is what's actually behind the inset look — on a
  // width-bound layout this leaves the artwork with visible side margins;
  // on a height-bound one (e.g. landscape) the height cap still wins, so it
  // never overflows vertically either way.
  useLayoutEffect(() => {
    const el = artworkSlotRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setArtworkSize(Math.min(width * 0.84, height, 460));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [showLyrics]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  if (!currentTrack) return null;

  const duration = currentTrack.duration;
  const progressPct = duration ? (progress / duration) * 100 : 0;

  const handleArtworkTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setShowSongInfo(true);
    }, LONG_PRESS_MS);
  };

  const handleArtworkTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleArtworkTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressFired.current || !touchStart.current) {
      touchStart.current = null;
      return;
    }
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(dx) > SWIPE_SKIP_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
      return;
    }

    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        if (!isFavorite(currentTrack.id)) toggleFavorite(currentTrack);
        setLikeBurst(true);
        setTimeout(() => setLikeBurst(false), 700);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  // Swipe-down-to-dismiss on the whole sheet (not just the artwork).
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleSheetTouchEnd = (e: React.TouchEvent) => {
    if (!sheetTouchStart.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - sheetTouchStart.current.x;
    const dy = touch.clientY - sheetTouchStart.current.y;
    sheetTouchStart.current = null;
    if (dy > SWIPE_DISMISS_THRESHOLD && Math.abs(dy) > Math.abs(dx)) onClose();
  };

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto backdrop-blur-2xl"
      onTouchStart={handleSheetTouchStart}
      onTouchEnd={handleSheetTouchEnd}
    >
      <div
        key={currentTrack.id}
        className="absolute inset-0 -z-10 bg-crossfade"
        style={{
          backgroundImage: `linear-gradient(180deg, ${currentTrack.gradient[0]}e6 0%, ${currentTrack.gradient[1]}f2 45%, #0b0b0d 100%)`,
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: `linear-gradient(180deg, ${currentTrack.gradient[0]}e6 0%, ${currentTrack.gradient[1]}f2 45%, #0b0b0d 100%)`,
        }}
      />

      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-2 shrink-0">
        <button
          onClick={onClose}
          className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:scale-90 transition-all"
          aria-label="Minimize player"
        >
          <span className="block w-8 h-1 rounded-full bg-white/60" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Now Playing</p>
        <button
          onClick={() => (user ? setShowAddToPlaylist(true) : navigate("/auth"))}
          className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:scale-90 transition-all"
          aria-label="Add to playlist"
        >
          <ListPlus size={22} />
        </button>
      </div>

      <div className={`flex-1 flex flex-col px-6 min-h-0 ${showLyrics ? "" : "items-center"}`}>
        {showLyrics ? (
          <LyricsPanel
            trackId={currentTrack.id}
            seed={`${currentTrack.title}::${currentTrack.artistName}`}
            progress={progress}
            duration={duration}
          />
        ) : (
          <div ref={artworkSlotRef} className="flex-1 min-h-0 w-full flex items-center justify-center mb-4">
            <div
              className="relative select-none"
              style={{ width: artworkSize || undefined, height: artworkSize || undefined }}
              onTouchStart={handleArtworkTouchStart}
              onTouchMove={handleArtworkTouchMove}
              onTouchEnd={handleArtworkTouchEnd}
              onDoubleClick={() => {
                if (!isFavorite(currentTrack.id)) toggleFavorite(currentTrack);
                setLikeBurst(true);
                setTimeout(() => setLikeBurst(false), 700);
              }}
            >
              <CoverArt
                gradient={currentTrack.gradient}
                size="lg"
                photoUrl={currentTrack.coverUrl}
                entityType="track"
                entityId={currentTrack.id}
                artworkFrame={currentTrack.artworkFrame}
                readOnlyArtwork={Boolean(currentTrack.albumId)}
                // Suppressed in favor of our own always-visible edit button
                // below — CoverArt's built-in one only reveals on :hover,
                // which never fires on a touchscreen phone.
                hideEditButton={canEditSingleCover}
                className={`shadow-2xl rounded-[22px] w-full h-full ${isPlaying ? "ring-2 ring-white/30" : ""}`}
              />
              {likeBurst && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Heart size={90} className="text-white drop-shadow-2xl animate-[icon-twinkle_0.7s_ease-out]" fill="white" />
                </div>
              )}
              {canEditSingleCover && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      coverFileInputRef.current?.click();
                    }}
                    disabled={uploadingCover}
                    className="absolute bottom-2 left-2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-all disabled:opacity-60"
                    aria-label={currentTrack.coverUrl ? "Replace cover art" : "Add cover art"}
                  >
                    {uploadingCover ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ImagePlus size={16} />
                    )}
                  </button>
                  {currentTrack.coverUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowArtworkEditor(true);
                      }}
                      className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-all"
                      aria-label="Recenter, zoom, or crop cover art"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCoverFilePick(file);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {showArtworkEditor && currentTrack?.coverUrl && (
          <ArtworkEditor
            photoUrl={currentTrack.coverUrl}
            initialFrame={currentTrack.artworkFrame}
            onClose={() => setShowArtworkEditor(false)}
            onSave={async (frame: ArtworkFrame) => {
              await handleArtworkFrameSave(frame);
              setShowArtworkEditor(false);
            }}
          />
        )}

        <div className="w-full max-w-xs mx-auto shrink-0">
          {!showLyrics && (
            <div className="mb-6">
              <MarqueeTitle text={currentTrack.title} />
              <p className="text-base text-white/70 truncate mt-1">{currentTrack.artistName}</p>
              {currentTrack.albumTitle && (
                <p className="text-xs text-white/45 truncate mt-0.5">{currentTrack.albumTitle}</p>
              )}
            </div>
          )}

          {!showLyrics && (
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => toggleFavorite(currentTrack)}
                className={`flex flex-col items-center gap-1 ${isFavorite(currentTrack.id) ? "text-brand" : "text-white/70"} active:scale-90 transition-all`}
                aria-label={isFavorite(currentTrack.id) ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Heart size={21} fill={isFavorite(currentTrack.id) ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => setShowQueue(true)}
                className="flex flex-col items-center gap-1 text-white/70 hover:text-white active:scale-90 transition-all"
                aria-label="Show queue"
              >
                <ListMusic size={21} />
              </button>
              {lyricsEnabled && (
                <button
                  onClick={() => setShowLyrics(true)}
                  className="flex flex-col items-center gap-1 text-white/70 hover:text-white active:scale-90 transition-all"
                  aria-label="Show lyrics"
                >
                  <Mic2 size={21} />
                </button>
              )}
              <button
                onClick={() => setShowSleepTimer(true)}
                className={`flex flex-col items-center gap-1 ${remainingLabel ? "text-brand" : "text-white/70 hover:text-white"} active:scale-90 transition-all`}
                aria-label="Sleep timer"
              >
                <Moon size={21} />
              </button>
            </div>
          )}
          {!showLyrics && remainingLabel && (
            <p className="text-center text-xs text-brand -mt-4 mb-5">{remainingLabel}</p>
          )}

          {showLyrics && (
            <button
              onClick={() => setShowLyrics(false)}
              className="self-center mx-auto mb-4 flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white"
            >
              <X size={12} />
              Close lyrics
            </button>
          )}

          <div className="mb-3">
            <input
              type="range"
              className="seek-xl w-full"
              style={{ ["--progress" as string]: `${progressPct}%` }}
              min={0}
              max={duration || 0}
              value={Math.min(progress, duration)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
            />
            <div className="flex items-center justify-between text-xs text-white/60 mt-2">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mb-6 px-1">
            <button
              onClick={toggleShuffle}
              className={`${shuffle ? "text-brand" : "text-white/70 hover:text-white"} active:scale-90 transition-all`}
              aria-label="Shuffle"
            >
              <Shuffle size={20} />
            </button>
            <button onClick={prev} className="text-white active:scale-90 transition-all" aria-label="Previous">
              <SkipBack size={30} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className={`w-20 h-20 rounded-full bg-white flex items-center justify-center text-black active:scale-95 hover:scale-105 transition-all shadow-2xl ${
                isPlaying ? "glow-pulse" : ""
              }`}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1.5" />}
            </button>
            <button onClick={next} className="text-white active:scale-90 transition-all" aria-label="Next">
              <SkipForward size={30} fill="currentColor" />
            </button>
            <button
              onClick={toggleRepeat}
              className={`${repeat ? "text-brand" : "text-white/70 hover:text-white"} active:scale-90 transition-all`}
              aria-label="Repeat"
            >
              {repeat ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
          </div>
        </div>
      </div>
      <div className="pb-[calc(env(safe-area-inset-bottom)+16px)] shrink-0" />
      {showQueue && (
        <QueuePanel
          currentTrack={currentTrack}
          queue={queue}
          onSelect={(track) => {
            playTrack(track, queue);
            setShowQueue(false);
          }}
          onClose={() => setShowQueue(false)}
        />
      )}
    </div>
    {showAddToPlaylist && (
      <AddToPlaylistModal track={currentTrack} onClose={() => setShowAddToPlaylist(false)} />
    )}
    {showSleepTimer && <SleepTimerSheet onClose={() => setShowSleepTimer(false)} />}
    {showSongInfo && (
      <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setShowSongInfo(false)}>
        <div className="absolute inset-0 bg-black/60" />
        <div
          className="relative bg-[#161618] rounded-t-3xl w-full max-w-md p-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
          <div className="flex items-center gap-2 mb-4">
            <Info size={18} className="text-brand" />
            <h2 className="text-base font-bold text-white">Song Information</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">Title</dt>
              <dd className="text-white text-right">{currentTrack.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">Artist</dt>
              <dd className="text-white text-right">{currentTrack.artistName}</dd>
            </div>
            {currentTrack.albumTitle && (
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Album</dt>
                <dd className="text-white text-right">{currentTrack.albumTitle}</dd>
              </div>
            )}
            {currentTrack.genre && (
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Genre</dt>
                <dd className="text-white text-right">{currentTrack.genre}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">Duration</dt>
              <dd className="text-white text-right">{formatDuration(currentTrack.duration)}</dd>
            </div>
          </dl>
          <button
            onClick={() => setShowSongInfo(false)}
            className="w-full mt-6 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold py-3 rounded-full transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )}
    </>,
    document.body
  );
}
