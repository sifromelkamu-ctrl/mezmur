import { Check, Moon, X } from "lucide-react";
import { SLEEP_TIMER_LABELS, useSleepTimer, type SleepTimerOption } from "../context/SleepTimerContext";

const OPTIONS: SleepTimerOption[] = [
  "off",
  "10min",
  "15min",
  "30min",
  "45min",
  "1hour",
  "end_of_song",
  "end_of_album",
  "end_of_playlist",
];

interface SleepTimerSheetProps {
  onClose: () => void;
}

export default function SleepTimerSheet({ onClose }: SleepTimerSheetProps) {
  const { option, setOption } = useSleepTimer();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#161618] rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 max-h-[75vh] overflow-y-auto overscroll-y-contain no-scrollbar">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between px-5 mb-2">
          <div className="flex items-center gap-2">
            <Moon size={18} className="text-brand" />
            <h2 className="text-base font-bold text-white">Sleep Timer</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-white/50 px-5 mb-2">Playback fades out and stops when the timer ends.</p>
        <div className="py-1">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setOption(opt);
                onClose();
              }}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/5 transition-colors"
            >
              <span className={`text-sm ${opt === "off" ? "text-white/70" : "text-white"}`}>
                {SLEEP_TIMER_LABELS[opt]}
              </span>
              {option === opt && <Check size={18} className="text-brand" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
