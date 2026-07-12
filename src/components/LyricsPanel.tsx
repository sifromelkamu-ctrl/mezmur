import { Info, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateLyrics } from "../utils/lyricsGenerator";

interface LyricsPanelProps {
  trackId: string;
  seed: string;
  progress: number;
  duration: number;
  // When a real, official lyrics source is wired up for a track, pass its
  // text here — the placeholder generator and its banner are skipped
  // entirely and this is shown instead. Currently always undefined since no
  // official-lyrics data source exists yet.
  officialLyrics?: string | null;
}

export default function LyricsPanel({ trackId, seed, progress, duration, officialLyrics }: LyricsPanelProps) {
  const [generating, setGenerating] = useState(true);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const lyrics = useMemo(() => generateLyrics(seed), [seed]);
  const hasOfficialLyrics = Boolean(officialLyrics && officialLyrics.trim());

  useEffect(() => {
    if (hasOfficialLyrics) return;
    setGenerating(true);
    const timeout = setTimeout(() => setGenerating(false), 500 + Math.random() * 400);
    return () => clearTimeout(timeout);
  }, [trackId, hasOfficialLyrics]);

  const activeIndex = duration
    ? Math.min(lyrics.lines.length - 1, Math.floor((progress / duration) * lyrics.lines.length))
    : 0;

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, generating]);

  if (hasOfficialLyrics) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-6 max-w-md mx-auto w-full">
        {officialLyrics!
          .split("\n")
          .map((line, i) => (
            <p key={i} className="text-lg font-bold text-center py-2 text-white/90">
              {line}
            </p>
          ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 mx-2 mb-3 flex items-start gap-2 rounded-lg bg-amber-400/15 border border-amber-400/30 px-3 py-2.5">
        <Info size={16} className="text-amber-300 shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-amber-200 leading-snug">
          Preview only — These are AI-generated placeholder lyrics, not official song lyrics.
        </p>
      </div>

      {generating ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/70">
          <Sparkles size={28} className="animate-pulse text-brand" />
          <p className="text-sm">Generating Amharic lyrics...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-6 max-w-md mx-auto w-full">
          {lyrics.lines.map((line, i) => (
            <p
              key={i}
              ref={i === activeIndex ? activeLineRef : undefined}
              className={`text-lg font-bold text-center py-2 transition-all duration-300 ${
                i === activeIndex ? "text-white scale-105" : "text-white/40"
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
