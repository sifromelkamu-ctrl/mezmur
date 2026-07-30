import { Play } from "lucide-react";
import { memo } from "react";
import { useNavigate } from "react-router-dom";
import defaultAlbumArt from "../../assets/default-album-art.jpg";
import EqualizerBars from "../EqualizerBars";
import { getPosition } from "../../lib/recentlyPlayed";
import { formatDuration } from "../../utils/format";
import type { ApiTrack } from "../../lib/api";

interface ContinueListeningCardProps {
  track: ApiTrack;
  playing: boolean;
  onPlay: () => void;
  onCardClick?: () => void;
  // Where clicking the card navigates when onCardClick is unset — the
  // parent knows whether track.albumId points at a regular Album or a
  // Concert Album (only it has the concerts list to check against), so it
  // computes this rather than this card guessing "/album/:id" for both.
  albumHref?: string;
}

// Bespoke card for Home's Continue Listening row — wider than the bare
// ArtTile used elsewhere (Albums/New Releases/Concerts), with a resume
// progress bar sourced from the real last-played position (see
// recentlyPlayed.ts's recordPosition, written throttled during playback
// and on pause). A track never played past its first save just shows an
// empty bar rather than fabricating a number.
function ContinueListeningCard({
  track,
  playing,
  onPlay,
  onCardClick,
  albumHref,
}: ContinueListeningCardProps) {
  const navigate = useNavigate();
  const to = albumHref ?? (track.albumId ? `/album/${track.albumId}` : undefined);
  const position = getPosition(track.id);
  const duration = track.duration ?? 0;
  const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div
      onClick={() => (onCardClick ? onCardClick() : to && navigate(to))}
      className="group relative w-40 shrink-0 cursor-pointer active:scale-[0.97] transition-transform duration-100"
    >
      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
          style={{
            backgroundImage: `url(${track.coverUrl || defaultAlbumArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />

        {playing && (
          <span className="absolute top-2.5 left-2.5 bg-black/60 rounded-full p-1.5 flex items-center justify-center">
            <EqualizerBars />
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-md ring-1 ring-gold/60 text-white active:scale-90 transition-all"
          aria-label={`Play ${track.title}`}
        >
          <Play size={12} fill="white" className="ml-0.5" />
        </button>

        <div className="absolute inset-x-0 bottom-0 p-3.5 pr-10">
          <p className="font-abyssinica text-[13px] font-bold text-white leading-snug line-clamp-2">{track.title}</p>
        </div>
      </div>

      <div className="h-1 rounded-full bg-border overflow-hidden mt-2">
        <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-[10px] text-fg-subtle mt-1 tabular-nums">
        {formatDuration(position)} / {formatDuration(duration)}
      </p>
    </div>
  );
}

export default memo(ContinueListeningCard);
