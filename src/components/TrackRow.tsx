import { Download, Heart, ListPlus, MoreVertical, Pause, Play, PlusCircle, X } from "lucide-react";
import { useState } from "react";
import { usePlayer } from "../context/PlayerContext";
import { useFavorites } from "../context/FavoritesContext";
import type { ApiTrack } from "../lib/api";
import { formatDuration } from "../utils/format";
import AddToPlaylistModal from "./AddToPlaylistModal";
import CoverArt from "./CoverArt";
import EqualizerBars from "./EqualizerBars";

interface TrackRowProps {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
  onRemove?: () => void;
  // Hidden on an artist's own page, where every row is already that one
  // artist — showing it again under each title is redundant.
  showArtistName?: boolean;
  // Adds a "N plays" column between the title and duration — used on
  // artist pages' "Popular Songs" list, off elsewhere to keep other rows
  // (search results, playlists) uncluttered.
  showPlayCount?: boolean;
  // Folds the album title into the subtitle line ("Artist · Album") — off
  // by default since most existing rows (an album's own track list, an
  // artist's popular songs) already imply the album from context.
  showAlbumTitle?: boolean;
  // Adds a favorite toggle + overflow menu (add to playlist, add to queue,
  // download) — off by default so every existing call site is unaffected;
  // opt in from list-style screens like the full Songs page.
  showActions?: boolean;
}

export default function TrackRow({
  track,
  index,
  queue,
  onRemove,
  showArtistName = true,
  showPlayCount = false,
  showAlbumTitle = false,
  showActions = false,
}: TrackRowProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, addToQueue } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [showMenu, setShowMenu] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const isCurrent = currentTrack?.id === track.id;
  const favorited = isFavorite(track.id);
  const hasTrailingColumn = showActions || Boolean(onRemove);

  const handleClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, queue);
    }
  };

  const subtitle =
    showAlbumTitle && track.albumTitle
      ? [showArtistName ? track.artistName : null, track.albumTitle].filter(Boolean).join(" · ")
      : showArtistName
        ? track.artistName
        : undefined;

  return (
    <div
      onClick={handleClick}
      className={`group grid ${
        showPlayCount && hasTrailingColumn
          ? "grid-cols-[24px_1fr_auto_auto_auto]"
          : showPlayCount || hasTrailingColumn
            ? "grid-cols-[24px_1fr_auto_auto]"
            : "grid-cols-[24px_1fr_auto]"
      } items-center gap-4 px-4 py-2 rounded-md hover:bg-hover cursor-pointer transition-colors ${
        isCurrent ? "bg-hover" : ""
      }`}
    >
      <div className="flex items-center justify-center text-sm text-fg-muted w-6">
        <span className="group-hover:hidden">
          {isCurrent && isPlaying ? <EqualizerBars /> : index}
        </span>
        <span className="hidden group-hover:flex">
          {isCurrent && isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
        </span>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <CoverArt
          gradient={track.gradient}
          size="sm"
          photoUrl={track.coverUrl}
          entityType="track"
          entityId={track.id}
          artworkFrame={track.artworkFrame}
        />
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${isCurrent ? "text-brand" : "text-fg"}`}>{track.title}</p>
          {subtitle && <p className="text-xs text-fg-muted truncate">{subtitle}</p>}
        </div>
      </div>

      {showPlayCount && (
        <span className="text-sm text-fg-muted tabular-nums">{(track.playCount ?? 0).toLocaleString()} plays</span>
      )}

      <span className="text-sm text-fg-muted tabular-nums text-right">{formatDuration(track.duration)}</span>

      {hasTrailingColumn && (
        <div className="flex items-center justify-end gap-1">
          {showActions && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(track);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                  favorited ? "text-brand" : "text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg"
                }`}
                aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart size={16} fill={favorited ? "currentColor" : "none"} />
              </button>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu((v) => !v);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg transition-colors shrink-0"
                  aria-label="More options"
                >
                  <MoreVertical size={16} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-elevated rounded-md shadow-2xl py-1 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          setShowAddToPlaylist(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                      >
                        <PlusCircle size={14} />
                        Add to playlist
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          addToQueue(track);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                      >
                        <ListPlus size={14} />
                        Add to queue
                      </button>
                      {track.audioUrl && (
                        <a
                          href={track.audioUrl}
                          download
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-fg-subtle hover:text-fg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              aria-label={`Remove ${track.title}`}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {showAddToPlaylist && <AddToPlaylistModal track={track} onClose={() => setShowAddToPlaylist(false)} />}
    </div>
  );
}
