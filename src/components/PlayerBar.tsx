import { Heart, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFavorites } from "../context/FavoritesContext";
import { usePlayer } from "../context/PlayerContext";
import CoverArt from "./CoverArt";
import EqualizerBars from "./EqualizerBars";
import NowPlaying from "./NowPlaying";

export default function PlayerBar() {
  const { currentTrack, isPlaying, progress, togglePlay } = usePlayer();
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [openLyricsFirst, setOpenLyricsFirst] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();

  // These effects decide when the bar should reappear on its own after a
  // dismiss: a new track starting, or playback resuming (paused -> playing)
  // from wherever it was actually triggered.
  useEffect(() => {
    setDismissed(false);
  }, [currentTrack?.id]);

  useEffect(() => {
    if (isPlaying) setDismissed(false);
  }, [isPlaying]);

  if (!currentTrack) return null;

  const duration = currentTrack.duration;
  const progressPct = duration ? (progress / duration) * 100 : 0;

  return (
    <footer
      className={`w-full rounded-[26px] bg-elevated/90 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out overflow-hidden ${
        dismissed ? "translate-y-[140%] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      }`}
      aria-hidden={dismissed}
    >
      <div className="flex items-center gap-3 pl-2.5 pr-2 py-2">
        <div
          onClick={() => setShowNowPlaying(true)}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
        >
          <CoverArt
            gradient={currentTrack.gradient}
            size="sm"
            photoUrl={currentTrack.coverUrl}
            entityType="track"
            entityId={currentTrack.id}
            artworkFrame={currentTrack.artworkFrame}
            className={isPlaying ? "ring-2 ring-brand/60 shadow-[0_0_14px_rgba(124,92,255,0.55)]" : ""}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{currentTrack.title}</p>
            <p className="text-xs text-fg-muted truncate">{currentTrack.artistName}</p>
          </div>
          {isPlaying && (
            <span className="shrink-0 flex items-center justify-center text-brand">
              <EqualizerBars />
            </span>
          )}
        </div>
        <button
          onClick={() => toggleFavorite(currentTrack)}
          className={`w-10 h-10 flex items-center justify-center shrink-0 rounded-full transition-colors ${
            isFavorite(currentTrack.id) ? "text-brand" : "text-fg-muted hover:text-fg"
          }`}
          aria-label={isFavorite(currentTrack.id) ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart size={18} fill={isFavorite(currentTrack.id) ? "currentColor" : "none"} />
        </button>
        <button
          onClick={togglePlay}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-brand to-brand-dark text-white shadow-[0_6px_18px_-4px_rgba(124,92,255,0.7)] active:scale-90 transition-transform"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={() => {
            if (isPlaying) togglePlay();
            setDismissed(true);
          }}
          className="w-6 h-6 self-center flex items-center justify-center shrink-0 rounded-full text-fg-muted/60 hover:text-fg-muted hover:bg-white/10 transition-colors"
          aria-label="Dismiss mini player"
        >
          <X size={13} />
        </button>
      </div>
      <div className="h-[3px] mx-3 mb-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-accent-cyan transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {showNowPlaying && (
        <NowPlaying
          onClose={() => {
            setShowNowPlaying(false);
            setOpenLyricsFirst(false);
            setDismissed(false);
          }}
          initialLyrics={openLyricsFirst}
        />
      )}
    </footer>
  );
}
