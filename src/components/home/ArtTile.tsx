import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CoverArt from "../CoverArt";
import EqualizerBars from "../EqualizerBars";
import type { ArtworkEntityType, ArtworkFrame } from "../../lib/api";

interface ArtTileProps {
  title: string;
  subtitle?: string;
  gradient: [string, string];
  // Optional — omit entirely for a track tile that should just play on
  // click instead of navigating anywhere (e.g. a Single: there's no album
  // to browse into, and clicking shouldn't jump to the artist's profile).
  to?: string;
  photoUrl?: string;
  entityType?: ArtworkEntityType;
  entityId?: string;
  artworkFrame?: ArtworkFrame;
  readOnlyArtwork?: boolean;
  playing?: boolean;
  showPlayIcon?: boolean;
  onPlay?: () => void;
  // Overrides the tile's default click behavior (navigate to `to`) — for a
  // track tile with no real detail page of its own, where a single click
  // should just play it. Mirrors Card's onCardClick.
  onCardClick?: () => void;
}

// A bare, borderless artwork tile — cover art plus title/artist beneath it,
// no elevated box background. Used across Home's "no boxed cards" sections
// (Continue Listening, New Releases, Albums) per the premium redesign.
export default function ArtTile({
  title,
  subtitle,
  gradient,
  to,
  photoUrl,
  entityType,
  entityId,
  artworkFrame,
  readOnlyArtwork,
  playing = false,
  showPlayIcon = false,
  onPlay,
  onCardClick,
}: ArtTileProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => (onCardClick ? onCardClick() : to && navigate(to))}
      className="group cursor-pointer w-full shrink-0"
    >
      <div className="relative">
        <CoverArt
          gradient={gradient}
          size="card"
          photoUrl={photoUrl}
          entityType={entityType}
          entityId={entityId}
          artworkFrame={artworkFrame}
          readOnlyArtwork={readOnlyArtwork}
          className={`w-full transition-transform duration-300 group-active:scale-95 group-hover:-translate-y-1 ${
            playing ? "ring-2 ring-brand/60 shadow-[0_0_18px_rgba(124,92,255,0.5)]" : ""
          }`}
        />
        {playing && (
          <span className="absolute bottom-2 left-2 bg-black/70 rounded-full p-1.5 flex items-center justify-center">
            <EqualizerBars />
          </span>
        )}
        {showPlayIcon && onPlay && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 active:scale-90 transition-all"
            aria-label={`Play ${title}`}
          >
            <Play size={14} fill="white" className="ml-0.5" />
          </button>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <p className="text-[13px] font-semibold text-fg truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-fg-muted truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
