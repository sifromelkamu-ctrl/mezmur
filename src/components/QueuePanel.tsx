import { ListMusic, X } from "lucide-react";
import type { ApiTrack } from "../lib/api";
import { renderWithAmharicStyle } from "../utils/scriptText";
import CoverArt from "./CoverArt";

interface QueuePanelProps {
  currentTrack: ApiTrack;
  queue: ApiTrack[];
  onSelect: (track: ApiTrack) => void;
  onClose: () => void;
}

// Read-only "up next" view over the player's existing queue — no new
// playback logic, just surfaces state PlayerContext already tracks.
export default function QueuePanel({ currentTrack, queue, onSelect, onClose }: QueuePanelProps) {
  const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
  const upNext = currentIndex >= 0 ? queue.slice(currentIndex + 1) : queue;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0b0b0d]">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-4 shrink-0">
        <div className="w-9" />
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Queue</p>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors"
          aria-label="Close queue"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-2 px-2">Now Playing</p>
        <div className="flex items-center gap-3 px-2 py-2 mb-4 rounded-md bg-white/5">
          <CoverArt
            gradient={currentTrack.gradient}
            size="sm"
            photoUrl={currentTrack.coverUrl}
            entityType="track"
            entityId={currentTrack.id}
            artworkFrame={currentTrack.artworkFrame}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{renderWithAmharicStyle(currentTrack.title)}</p>
            <p className="text-xs text-white/60 truncate">{renderWithAmharicStyle(currentTrack.artistName ?? "")}</p>
          </div>
        </div>

        {upNext.length > 0 ? (
          <>
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-2 px-2">Next Up</p>
            <div className="flex flex-col">
              {upNext.map((track, i) => (
                <button
                  key={`${track.id}-${i}`}
                  onClick={() => onSelect(track)}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/5 transition-colors text-left"
                >
                  <CoverArt
                    gradient={track.gradient}
                    size="sm"
                    photoUrl={track.coverUrl}
                    entityType="track"
                    entityId={track.id}
                    artworkFrame={track.artworkFrame}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{renderWithAmharicStyle(track.title)}</p>
                    <p className="text-xs text-white/60 truncate">{renderWithAmharicStyle(track.artistName ?? "")}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-white/60 text-sm bg-white/5 rounded-lg p-4">
            <ListMusic size={18} />
            Nothing else queued.
          </div>
        )}
      </div>
    </div>
  );
}
