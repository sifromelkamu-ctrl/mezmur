import { Check, Play, Plus, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isBannerSaved, toggleBannerSaved } from "../../lib/savedBanners";

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
  // Which slide ids are "saved" (the "+" button) — read once per slide set
  // change rather than per-render; toggled optimistically on click.
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(slides.filter((s) => isBannerSaved(s.id)).map((s) => s.id)));

  useEffect(() => {
    setSavedIds(new Set(slides.filter((s) => isBannerSaved(s.id)).map((s) => s.id)));
  }, [slides]);

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

  const handleToggleSave = (id: string) => {
    const nowSaved = toggleBannerSaved(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="mb-8">
      <div
        className="relative w-full h-[300px] rounded-[28px] overflow-hidden border border-gold/25 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide) => {
            const saved = savedIds.has(slide.id);
            return (
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
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/30 backdrop-blur-md ring-1 ring-gold/50 text-gold text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1 mb-3">
                    <TrendingUp size={11} strokeWidth={2.5} />
                    {slide.tag}
                  </span>
                  <h2 className="font-playfair text-3xl font-bold tracking-tight text-white leading-tight mb-1 drop-shadow-sm">
                    {slide.title}
                  </h2>
                  <p className="text-sm font-semibold text-gold mb-4">{slide.subtitle}</p>
                  <div className="flex items-center gap-2.5">
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSave(slide.id);
                      }}
                      aria-label={saved ? "Remove from saved" : "Save"}
                      className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md ring-1 ring-white/25 text-white active:scale-90 transition-all"
                    >
                      {saved ? <Check size={16} className="text-gold" /> : <Plus size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
                i === index ? "w-5 bg-gold shadow-[0_0_8px_rgba(243,201,105,0.8)]" : "w-1.5 bg-fg-subtle/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
