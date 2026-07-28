import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bibleAudioUrl } from "../lib/bibleAudio";
import { emitMediaStarted, onMediaStarted } from "../lib/mediaEvents";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export interface BibleAudioTarget {
  bookSlug: string;
  chapter: number;
  label: string;
  language: "am" | "en";
  verseText: string;
}

interface BibleAudioContextValue {
  current: BibleAudioTarget | null;
  isPlaying: boolean;
  isTarget: (bookSlug: string, chapter: number) => boolean;
  toggleListen: (target: BibleAudioTarget) => void;
  stop: () => void;
}

const BibleAudioContext = createContext<BibleAudioContextValue | null>(null);

// Lives above the router (see App.tsx) so this outlives whichever page
// mounted it — the whole point is that leaving the Bible page, or the app
// going to the background, must not cut the chapter off. Modeled on
// PlayerContext's own top-level <audio> element for the same reason.
export function BibleAudioProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<BibleAudioTarget | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Read inside callbacks that shouldn't themselves depend on `current` (the
  // ended/error listeners are attached once, not re-attached per chapter).
  const currentRef = useRef<BibleAudioTarget | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      audioRef.current = null;
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (speechSupported) window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrent(null);
  }, []);

  // Text-to-speech has no reliable resume-from-position on WebKit (a known
  // engine bug — speechSynthesis.resume() often just stays silent), so a
  // re-toggle always restarts the chapter from the top rather than pausing
  // in place. Same behavior this already had before it could run in the
  // background.
  const speak = useCallback((target: BibleAudioTarget) => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target.verseText);
    utterance.lang = target.language === "am" ? "am-ET" : "en-US";
    utterance.rate = 0.9;
    const isStillCurrent = () =>
      currentRef.current?.bookSlug === target.bookSlug && currentRef.current?.chapter === target.chapter;
    utterance.onend = () => {
      if (isStillCurrent()) setIsPlaying(false);
    };
    utterance.onerror = () => {
      if (isStillCurrent()) setIsPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  }, []);

  const playRealAudio = useCallback(
    (target: BibleAudioTarget) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = bibleAudioUrl(target.bookSlug, target.chapter);
      audio.currentTime = 0;
      audio.play().then(
        () => setIsPlaying(true),
        () => speak(target)
      );
    },
    [speak]
  );

  const start = useCallback(
    (target: BibleAudioTarget) => {
      if (speechSupported) window.speechSynthesis.cancel();
      setCurrent(target);
      emitMediaStarted("bible");
      if (target.language === "am") playRealAudio(target);
      else speak(target);
    },
    [playRealAudio, speak]
  );

  const toggleListen = useCallback(
    (target: BibleAudioTarget) => {
      const active = currentRef.current;
      const isSameChapter = active?.bookSlug === target.bookSlug && active?.chapter === target.chapter;
      if (isSameChapter) {
        if (isPlaying) {
          if (active.language === "am") audioRef.current?.pause();
          else if (speechSupported) window.speechSynthesis.cancel();
          setIsPlaying(false);
        } else if (active.language === "am") {
          audioRef.current?.play().then(
            () => setIsPlaying(true),
            () => speak(active)
          );
        } else {
          speak(active);
        }
        return;
      }
      start(target);
    },
    [isPlaying, speak, start]
  );

  // Real chapter recording ended, or 404'd/failed to decode — the latter
  // falls back to text-to-speech so a chapter missing its recording still
  // plays something on the very first tap, not the second.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      if (currentRef.current) speak(currentRef.current);
    };
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [speak]);

  // The music player started (or resumed) elsewhere — only one audio source
  // plays at a time, so this one yields entirely rather than just pausing.
  useEffect(() => {
    return onMediaStarted((source) => {
      if (source !== "bible") stop();
    });
  }, [stop]);

  const isTarget = useCallback(
    (bookSlug: string, chapter: number) => current?.bookSlug === bookSlug && current?.chapter === chapter,
    [current]
  );

  const value = useMemo(
    () => ({ current, isPlaying, isTarget, toggleListen, stop }),
    [current, isPlaying, isTarget, toggleListen, stop]
  );

  return <BibleAudioContext.Provider value={value}>{children}</BibleAudioContext.Provider>;
}

export function useBibleAudio() {
  const ctx = useContext(BibleAudioContext);
  if (!ctx) throw new Error("useBibleAudio must be used within BibleAudioProvider");
  return ctx;
}
