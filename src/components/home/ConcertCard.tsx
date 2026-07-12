import { Disc3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ConcertCardProps {
  title: string;
  artistName?: string;
  dateLabel?: string;
  gradient: [string, string];
  photoUrl?: string;
  to: string;
}

export default function ConcertCard({ title, artistName, dateLabel, gradient, photoUrl, to }: ConcertCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(to)}
      className="group relative w-64 shrink-0 rounded-3xl overflow-hidden cursor-pointer active:scale-[0.97] transition-transform duration-200 ring-1 ring-white/10"
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
      <div className="absolute inset-0 backdrop-blur-[1px]" />

      {dateLabel && (
        <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1">
          {dateLabel}
        </span>
      )}
      <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-accent-violet/25 backdrop-blur-md ring-1 ring-accent-violet/40 flex items-center justify-center">
        <Disc3 size={13} className="text-accent-violet" />
      </span>

      <div className="relative h-36 flex flex-col justify-end p-4">
        <p className="text-base font-bold text-white leading-tight truncate">{title}</p>
        {artistName && <p className="text-xs text-white/65 truncate mt-0.5">{artistName}</p>}
      </div>
    </div>
  );
}
