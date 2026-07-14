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
        <p className="text-[15px] font-bold text-white leading-tight truncate">{title}</p>
        <p className="text-xs text-white/60 truncate mt-0.5">{subtitle}</p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-brand text-black flex items-center justify-center shadow-[0_8px_20px_-4px_rgba(124,92,255,0.8)] active:scale-90 transition-transform"
        aria-label={`Play ${title}`}
      >
        <Play size={15} fill="black" className="ml-0.5" />
      </button>
    </div>
  );
}
