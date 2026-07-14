import { Music2, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CoverArt from "./CoverArt";
import EqualizerBars from "./EqualizerBars";
import { useArtworkPalette } from "../hooks/useArtworkPalette";
import type { ArtworkEntityType, ArtworkFrame } from "../lib/api";
import { renderWithAmharicStyle } from "../utils/scriptText";

interface CardProps {
  title: string;
  subtitle: string;
  gradient: [string, string];
  to: string;
  rounded?: boolean;
  dense?: boolean;
  large?: boolean;
  // Tall rectangular portrait card with the title/subtitle overlaid on the
  // artwork itself (name-tag style), used for artists instead of a circular
  // photo — distinct from the square `large` album/playlist card below.
  portrait?: boolean;
  // Portrait-only: stretches to fill its container instead of the fixed
  // w-36 used in horizontal-scroll rows — for a 2-column grid (Library's
  // artist grid) where the card should fill its grid cell edge-to-edge
  // rather than float at a fixed width with empty space around it.
  fullWidth?: boolean;
  showSubtitle?: boolean;
  photoUrl?: string;
  playing?: boolean;
  onPlay?: () => void;
  // Overrides the card's default click behavior (navigate to `to`) — for
  // cards representing a bare track with no real detail page of its own
  // (e.g. the Home Songs carousel), where a single click should just play
  // it instead of navigating to its artist/album. Every existing caller
  // omits this and keeps navigating exactly as before.
  onCardClick?: () => void;
  // Universal Artwork System — square (non-portrait) cards only. Portrait
  // artist cards keep their existing 3:4 "poster" crop, a distinct
  // pre-existing design from the square admin-editable artwork frame, so
  // they're intentionally not wired into the frame editor here.
  entityType?: ArtworkEntityType;
  entityId?: string;
  artworkFrame?: ArtworkFrame;
  onFrameSaved?: (frame: ArtworkFrame) => void;
  // "Album Artwork Is Master Artwork": pass true for a track that belongs to
  // an album so its edit button is suppressed (edit the album instead),
  // while its artwork still renders normally. See CoverArt's own prop.
  readOnlyArtwork?: boolean;
  // Extra classes appended to the title text — e.g. `font-display` for a
  // more premium/editorial look on a card that otherwise reads too plain
  // (Home's artist cards, once their monthly-listener subtitle is gone).
  titleClassName?: string;
}

export default function Card({
  title,
  subtitle,
  gradient,
  to,
  rounded = false,
  dense = false,
  large = false,
  portrait = false,
  fullWidth = false,
  showSubtitle,
  photoUrl,
  playing = false,
  onPlay,
  onCardClick,
  entityType,
  entityId,
  artworkFrame,
  onFrameSaved,
  readOnlyArtwork,
  titleClassName = "",
}: CardProps) {
  const shouldShowSubtitle = showSubtitle ?? !dense;
  const navigate = useNavigate();
  const artSize = large ? "card" : "md";
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const palette = useArtworkPalette(portrait && showPhoto ? photoUrl : undefined, gradient);

  if (portrait) {
    return (
      <div
        onClick={() => navigate(to)}
        className={`card-hover group cursor-pointer relative rounded-2xl overflow-hidden aspect-[3/4] ${
          fullWidth ? "w-full" : "w-36"
        }`}
        style={{
          boxShadow: `0 14px 32px -12px ${palette.shadow}b3`,
        }}
      >
        <div
          key={`${palette.primary}-${palette.secondary}`}
          className="absolute inset-0 bg-crossfade"
          style={{
            backgroundImage: `radial-gradient(130% 130% at 12% 12%, rgba(255,255,255,0.22), transparent 45%), linear-gradient(150deg, ${palette.primary}, ${palette.secondary})`,
          }}
        />
        {showPhoto ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
              photoLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setPhotoLoaded(true)}
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`rounded-full flex items-center justify-center bg-white/10 ring-1 ring-white/25 backdrop-blur-sm shadow-inner ${
                fullWidth ? "w-20 h-20" : "w-14 h-14"
              }`}
            >
              <Music2 size={fullWidth ? 36 : 26} className="text-white/90" strokeWidth={1.5} />
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className={`font-semibold text-sm text-white truncate ${titleClassName}`}>{renderWithAmharicStyle(title)}</p>
          {shouldShowSubtitle && <p className="text-xs text-white/70 truncate mt-0.5">{renderWithAmharicStyle(subtitle)}</p>}
        </div>
        {playing && (
          <span className="absolute top-2 left-2 bg-black/70 rounded-full p-1.5 flex items-center justify-center">
            <EqualizerBars />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => (onCardClick ? onCardClick() : navigate(to))}
      className={`card-hover group bg-elevated hover:bg-elevated-hover transition-colors rounded-xl cursor-pointer relative border border-transparent hover:border-brand/20 ${
        large ? "p-3" : dense ? "p-2" : "p-4"
      }`}
    >
      <div
        className={`relative overflow-hidden ${rounded ? "rounded-full" : large ? "rounded-2xl" : "rounded-md"} ${
          large ? "mb-3" : dense ? "mb-2" : "mb-4"
        } ${large ? "mx-auto" : ""}`}
        style={large ? { width: "fit-content" } : undefined}
      >
        <CoverArt
          gradient={gradient}
          size={artSize}
          rounded={rounded}
          photoUrl={photoUrl}
          entityType={entityType}
          entityId={entityId}
          artworkFrame={artworkFrame}
          onFrameSaved={onFrameSaved}
          readOnlyArtwork={readOnlyArtwork}
          className={`transition-transform duration-300 group-hover:scale-105 active:scale-95 ${
            playing ? "ring-2 ring-brand/60 shadow-[0_0_14px_rgba(242,183,5,0.55)]" : ""
          }`}
        />
        {playing && (
          <span className="absolute bottom-1 left-1 bg-black/70 rounded-full p-1.5 flex items-center justify-center">
            <EqualizerBars />
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          className={`absolute bottom-1.5 right-1.5 rounded-full bg-brand text-black flex items-center justify-center shadow-xl shadow-brand/30 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 hover:scale-110 transition-all ${
            dense ? "w-7 h-7" : large ? "w-10 h-10" : "w-11 h-11"
          }`}
          aria-label={`Play ${title}`}
        >
          <Play size={dense ? 12 : large ? 16 : 18} fill="black" className="ml-0.5" />
        </button>
      </div>
      <div className={large ? "text-center" : ""}>
        <p className={`font-semibold truncate ${large ? "text-sm" : "text-sm"}`}>{renderWithAmharicStyle(title)}</p>
        {shouldShowSubtitle && (
          <p className={`text-xs text-fg-muted mt-1 truncate ${dense ? "" : "line-clamp-2"}`}>
            {renderWithAmharicStyle(subtitle)}
          </p>
        )}
      </div>
    </div>
  );
}
