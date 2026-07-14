import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderWithAmharicStyle } from "../../utils/scriptText";

export interface HeroSlide {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  buttonText: string;
  photoUrl?: string;
  gradient: [string, string];
  onOpen: () => void;
  onPlay: () => void;
}

interface HeroCarouselProps {
  slides: HeroSlide[];
}

const AUTO_SLIDE_MS = 5500;

export default function HeroCarousel({ slides }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length, index]);

  if (slides.length === 0) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      setIndex((i) => (delta < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length));
    }
    touchStartX.current = null;
  };

  return (
    <div className="mb-8">
      <div
        className="relative w-full h-[240px] rounded-[28px] overflow-hidden shadow-[0_24px_60px_-20px_rgba(124,92,255,0.45)]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="relative w-full h-full shrink-0 cursor-pointer" onClick={slide.onOpen}>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: slide.photoUrl
                    ? `url(${slide.photoUrl})`
                    : `linear-gradient(150deg, ${slide.gradient[0]}, ${slide.gradient[1]})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/10 to-transparent" />

              <div className="relative h-full flex flex-col justify-end p-6">
                <span className="inline-flex w-fit items-center rounded-full bg-black/45 backdrop-blur-md ring-1 ring-white/25 text-white text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1 mb-3">
                  {slide.tag}
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white leading-tight mb-1 drop-shadow-sm">
                  {renderWithAmharicStyle(slide.title)}
                </h2>
                <p className="text-sm font-semibold text-accent-cyan mb-4">{renderWithAmharicStyle(slide.subtitle)}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    slide.onPlay();
                  }}
                  className="w-fit flex items-center gap-2 rounded-full bg-gradient-to-r from-gold to-gold-dark text-black text-sm font-bold pl-4 pr-5 py-2.5 shadow-[0_8px_24px_-6px_rgba(243,201,105,0.7)] active:scale-95 transition-transform"
                >
                  <Play size={15} fill="black" />
                  {slide.buttonText}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-5 bg-brand shadow-[0_0_8px_rgba(124,92,255,0.8)]" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
