import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePlayer } from "./PlayerContext";

export type SleepTimerOption =
  | "off"
  | "10min"
  | "15min"
  | "30min"
  | "45min"
  | "1hour"
  | "end_of_song"
  | "end_of_album"
  | "end_of_playlist";

const DURATION_MS: Partial<Record<SleepTimerOption, number>> = {
  "10min": 10 * 60 * 1000,
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "45min": 45 * 60 * 1000,
  "1hour": 60 * 60 * 1000,
};

export const SLEEP_TIMER_LABELS: Record<SleepTimerOption, string> = {
  off: "Off",
  "10min": "10 minutes",
  "15min": "15 minutes",
  "30min": "30 minutes",
  "45min": "45 minutes",
  "1hour": "1 hour",
  end_of_song: "End of current song",
  end_of_album: "End of current album",
  end_of_playlist: "End of current playlist",
};

interface SleepTimerContextValue {
  option: SleepTimerOption;
  remainingLabel: string | null;
  setOption: (option: SleepTimerOption) => void;
}

const SleepTimerContext = createContext<SleepTimerContextValue | null>(null);

const FADE_STEPS = 20;
const FADE_DURATION_MS = 4000;

// A standalone feature layered entirely on top of the existing player: it
// only ever calls usePlayer()'s already-public controls (togglePlay,
// setVolume) to stop playback — nothing in PlayerContext itself is touched,
// so the playback engine, queue, and progress logic are unaffected whether
// or not a sleep timer is armed.
export function SleepTimerProvider({ children }: { children: ReactNode }) {
  const { isPlaying, currentTrack, queue, volume, setVolume, togglePlay } = usePlayer();
  const [option, setOptionState] = useState<SleepTimerOption>("off");
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);
  const originalVolume = useRef(volume);
  const armedAlbumId = useRef<string | null>(null);
  const armedQueueIds = useRef<string[]>([]);
  const seenTrackIds = useRef<Set<string>>(new Set());
  const fadingRef = useRef(false);

  const stopWithFade = useCallback(() => {
    if (fadingRef.current || !isPlaying) {
      if (isPlaying) togglePlay();
      return;
    }
    fadingRef.current = true;
    originalVolume.current = volume;
    let step = 0;
    const interval = window.setInterval(() => {
      step += 1;
      const next = Math.max(0, originalVolume.current * (1 - step / FADE_STEPS));
      setVolume(next);
      if (step >= FADE_STEPS) {
        window.clearInterval(interval);
        togglePlay();
        setVolume(originalVolume.current);
        fadingRef.current = false;
      }
    }, FADE_DURATION_MS / FADE_STEPS);
  }, [isPlaying, volume, setVolume, togglePlay]);

  const setOption = useCallback(
    (next: SleepTimerOption) => {
      setOptionState(next);
      seenTrackIds.current = new Set(currentTrack ? [currentTrack.id] : []);
      armedAlbumId.current = currentTrack?.albumId ?? null;
      armedQueueIds.current = queue.map((t) => t.id);
      if (next === "off") {
        setDeadline(null);
        setRemainingLabel(null);
        return;
      }
      const duration = DURATION_MS[next];
      setDeadline(duration ? Date.now() + duration : null);
    },
    [currentTrack, queue]
  );

  // Fixed-duration countdown display + expiry.
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const msLeft = deadline - Date.now();
      if (msLeft <= 0) {
        setRemainingLabel(null);
        setDeadline(null);
        setOptionState("off");
        stopWithFade();
        return;
      }
      const mins = Math.floor(msLeft / 60000);
      const secs = Math.floor((msLeft % 60000) / 1000);
      setRemainingLabel(`${mins}:${secs.toString().padStart(2, "0")} left`);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, stopWithFade]);

  // Track-boundary options: re-evaluated whenever the current track changes.
  useEffect(() => {
    if (option === "off" || DURATION_MS[option] || !currentTrack) return;

    if (option === "end_of_song") {
      if (!seenTrackIds.current.has(currentTrack.id)) {
        setOptionState("off");
        setRemainingLabel(null);
        stopWithFade();
      }
      return;
    }

    if (option === "end_of_album") {
      if (armedAlbumId.current && currentTrack.albumId !== armedAlbumId.current) {
        setOptionState("off");
        setRemainingLabel(null);
        stopWithFade();
      }
      return;
    }

    if (option === "end_of_playlist") {
      seenTrackIds.current.add(currentTrack.id);
      const allSeen = armedQueueIds.current.length > 0 && armedQueueIds.current.every((id) => seenTrackIds.current.has(id));
      if (allSeen && !seenTrackIds.current.has(`__done__${currentTrack.id}`)) {
        setOptionState("off");
        setRemainingLabel(null);
        stopWithFade();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  useEffect(() => {
    if (option === "end_of_song" || option === "end_of_album" || option === "end_of_playlist") {
      const label = SLEEP_TIMER_LABELS[option];
      setRemainingLabel(label);
    }
  }, [option]);

  return (
    <SleepTimerContext.Provider value={{ option, remainingLabel, setOption }}>{children}</SleepTimerContext.Provider>
  );
}

export function useSleepTimer() {
  const ctx = useContext(SleepTimerContext);
  if (!ctx) throw new Error("useSleepTimer must be used within SleepTimerProvider");
  return ctx;
}
