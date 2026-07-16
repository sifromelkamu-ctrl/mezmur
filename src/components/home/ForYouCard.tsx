import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";

interface ForYouCardProps {
  title: string;
  subtitle: string;
  gradient: [string, string];
  // Omit to have the card just play on click instead of navigating — used
  // whenever there's no real detail page to browse into (a Single, or any
  // track with no album), so clicking never opens the artist's profile.
  to?: string;
  photoUrl?: string;
  onPlay: () => void;
  onCardClick?: () => void;
}

export default function ForYouCard({ title, subtitle, gradient, to, photoUrl, onPlay, onCardClick }: ForYouCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => (onCardClick ? onCardClick() : to && navigate(to))}
      className="group relative w-full aspect-[4/5] rounded-3xl overflow-hidden cursor-pointer active:scale-[0.97] transition-transform duration-200"
    >
      <div
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
        style={{
          backgroundImage: photoUrl
            ? `url(${photoUrl})`
            : `linear-gradient(150deg, ${gradient[0]}, ${gradient[1]})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl" />

      <div className="relative h-full flex flex-col justify-end p-4">
        <p className="text-[13px] font-bold text-white leading-tight truncate">{title}</p>
        <p className="text-[11px] text-white/60 truncate mt-0.5">{subtitle}</p>
      </div>

      {/* Sized/styled to match the artist cards' play button (Card.tsx's
          portrait variant) — this one used to be noticeably larger and a
          solid brand color, which read as inconsistent sitting right below
          the Artists row on Home. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-90 hover:scale-105 transition-transform"
        aria-label={`Play ${title}`}
      >
        <Play size={14} fill="white" className="text-white ml-0.5" />
      </button>
    </div>
  );
}
