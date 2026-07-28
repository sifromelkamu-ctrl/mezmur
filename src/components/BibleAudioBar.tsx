import { BookOpenText, Pause, Play, X } from "lucide-react";
import { useBibleAudio } from "../context/BibleAudioContext";

// Persistent, app-wide mini player for Bible chapter audio — mounted
// alongside PlayerBar in App.tsx (outside the routed page tree) so it keeps
// playing while the reader browses elsewhere, exactly like the music
// PlayerBar does. The two are mutually exclusive (see mediaEvents.ts), so
// only one of them ever has anything to render at a time.
export default function BibleAudioBar() {
  const { current, isPlaying, toggleListen, stop } = useBibleAudio();

  if (!current) return null;

  return (
    <footer className="w-full rounded-[26px] bg-elevated/90 backdrop-blur-2xl ring-1 ring-white/10 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="flex items-center gap-3 pl-3 pr-2 py-2">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0 text-black">
          <BookOpenText size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{current.label}</p>
          <p className="text-xs text-fg-muted truncate">{isPlaying ? "Listening" : "Paused"}</p>
        </div>
        <button
          onClick={() => toggleListen(current)}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-brand to-brand-dark text-black shadow-[0_6px_18px_-4px_rgba(124,92,255,0.7)] active:scale-90 transition-transform"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={stop}
          className="w-6 h-6 self-center flex items-center justify-center shrink-0 rounded-full text-fg-muted/60 hover:text-fg-muted hover:bg-white/10 transition-colors"
          aria-label="Close Bible audio"
        >
          <X size={13} />
        </button>
      </div>
    </footer>
  );
}
