import { Play, Ticket } from "lucide-react";
import { memo } from "react";
import CoverArt from "../CoverArt";
import EqualizerBars from "../EqualizerBars";
import type { ArtworkFrame } from "../../lib/api";

interface ConcertSongTileProps {
  title: string;
  subtitle?: string;
  gradient: [string, string];
  photoUrl?: string;
  entityId: string;
  artworkFrame?: ArtworkFrame;
  playing?: boolean;
  onPlay: () => void;
}

// A standalone Concert Song sitting in the same horizontal list as full
// Concert Albums (Home's Concerts section) — deliberately smaller than
// ArtTile's album-style card (its wrapper is narrower, see Home.tsx) with a
// small "Concert" badge so the two card types stay visually distinct at a
// glance. Tapping always plays immediately — a standalone song has no
// tracklist/detail page to open (see ConcertDetail.tsx, which only ever
// switches between Concert Albums).
function ConcertSongTile({
  title,
  subtitle,
  gradient,
  photoUrl,
  entityId,
  artworkFrame,
  playing = false,
  onPlay,
}: ConcertSongTileProps) {
  return (
    <div onClick={onPlay} className="group cursor-pointer w-full shrink-0">
      <div className="relative">
        <CoverArt
          gradient={gradient}
          size="card"
          photoUrl={photoUrl}
          entityType="track"
          entityId={entityId}
          artworkFrame={artworkFrame}
          className={`w-full transition-transform duration-100 group-active:scale-95 group-hover:-translate-y-1 ${
            playing ? "ring-2 ring-brand/60 shadow-[0_0_18px_rgba(124,92,255,0.5)]" : ""
          }`}
        />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5">
          <Ticket size={9} className="text-accent-violet" />
          <span className="text-[9px] font-bold uppercase tracking-wide text-white">Concert</span>
        </div>
        {playing ? (
          <span className="absolute bottom-2 left-2 bg-black/70 rounded-full p-1.5 flex items-center justify-center">
            <EqualizerBars />
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 active:scale-90 transition-all"
            aria-label={`Play ${title}`}
          >
            <Play size={13} fill="white" className="ml-0.5" />
          </button>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-[13px] font-semibold text-fg truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-fg-muted truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default memo(ConcertSongTile);
