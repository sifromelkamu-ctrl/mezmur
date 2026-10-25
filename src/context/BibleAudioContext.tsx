import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BIBLE_BOOKS } from "../data/bibleBooks";
import { bibleAudioUrl } from "../lib/bibleAudio";
import { emitMediaStarted, onMediaStarted } from "../lib/mediaEvents";
import { loadReadingPrefs } from "../utils/bibleReadingPrefs";
import { fetchChapterText } from "../utils/bibleVerseLookup";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export interface BibleAudioTarget {
  bookSlug: string;
  chapter: number;
  label: string;
  language: "am" | "en";
  verseText: string;
}

export type BibleSleepTimerOption = "off" | "10min" | "15min" | "30min" | "45min" | "1hour" | "end_of_chapter";

const SLEEP_DURATION_MS: Partial<Record<BibleSleepTimerOption, number>> = {
  "10min": 10 * 60 * 1000,
  "15min": 15 * 60 * 1000,
  "30min": 30 * 60 * 1000,
  "45min": 45 * 60 * 1000,
  "1hour": 60 * 60 * 1000,
};

export const BIBLE_SLEEP_TIMER_LABELS: Record<BibleSleepTimerOption, string> = {
  off: "Off",
  "10min": "10 minutes",
  "15min": "15 minutes",
  "30min": "30 minutes",
  "45min": "45 minutes",
  "1hour": "1 hour",
  end_of_chapter: "End of current chapter",
};

interface BibleAudioContextValue {
  current: BibleAudioTarget | null;
  isPlaying: boolean;
  isTarget: (bookSlug: string, chapter: number) => boolean;
  toggleListen: (target: BibleAudioTarget) => void;
  stop: () => void;
  sleepOption: BibleSleepTimerOption;
  sleepRemainingLabel: string | null;
  setSleepOption: (option: BibleSleepTimerOption) => void;
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
  const chapterCacheRef = useRef<Map<string, Record<string, string[]> | null>>(new Map());

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
      if (isStillCurrent()) chapterFinishedRef.current();
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

  // Continues straight into the next chapter (same book, or chapter 1 of
  // the next book in canonical order once the current one runs out) rather
  // than stopping at the end of each chapter — fetches that chapter's text
  // itself (same book-JSON path the reader uses) since this context has no
  // page mounted to hand it one. Reads englishVersion fresh from storage
  // each time rather than threading it through BibleAudioTarget, so a
  // version change mid-playback is picked up on the very next chapter.
  const advanceToNext = useCallback(
    async (from: BibleAudioTarget) => {
      const bookIndex = BIBLE_BOOKS.findIndex((b) => b.slug === from.bookSlug);
      if (bookIndex === -1) {
        stop();
        return;
      }
      const book = BIBLE_BOOKS[bookIndex];
      const nextBook = from.chapter < book.chapterCount ? book : BIBLE_BOOKS[bookIndex + 1];
      const nextChapter = from.chapter < book.chapterCount ? from.chapter + 1 : 1;
      if (!nextBook) {
        // Revelation 22 just finished — nothing further to play.
        stop();
        return;
      }
      const englishVersion = loadReadingPrefs().englishVersion;
      const text = await fetchChapterText(nextBook.slug, nextChapter, from.language, englishVersion, chapterCacheRef.current);
      // The chapter that triggered this is still the active one until the
      // fetch resolves — if something else started meanwhile (user picked
      // a different chapter, stopped, or the music player took over),
      // don't clobber it with a stale auto-advance.
      if (currentRef.current?.bookSlug !== from.bookSlug || currentRef.current?.chapter !== from.chapter) return;
      if (!text) {
        stop();
        return;
      }
      const label = `${from.language === "en" ? nextBook.name : nextBook.nameAm} ${nextChapter}`;
      start({ bookSlug: nextBook.slug, chapter: nextChapter, label, language: from.language, verseText: text });
    },
    [stop, start]
  );

  // --- Sleep timer (mirrors SleepTimerContext's own duration-countdown
  // shape for the music player, scoped to Bible audio) ---
  const [sleepOption, setSleepOptionState] = useState<BibleSleepTimerOption>("off");
  const sleepOptionRef = useRef<BibleSleepTimerOption>("off");
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [sleepRemainingLabel, setSleepRemainingLabel] = useState<string | null>(null);

  useEffect(() => {
    sleepOptionRef.current = sleepOption;
  }, [sleepOption]);

  const setSleepOption = useCallback((next: BibleSleepTimerOption) => {
    setSleepOptionState(next);
    if (next === "off") {
      setSleepDeadline(null);
      setSleepRemainingLabel(null);
      return;
    }
    if (next === "end_of_chapter") {
      setSleepDeadline(null);
      setSleepRemainingLabel(BIBLE_SLEEP_TIMER_LABELS.end_of_chapter);
      return;
    }
    const duration = SLEEP_DURATION_MS[next];
    setSleepDeadline(duration ? Date.now() + duration : null);
  }, []);

  useEffect(() => {
    if (!sleepDeadline) return;
    const tick = () => {
      const msLeft = sleepDeadline - Date.now();
      if (msLeft <= 0) {
        setSleepRemainingLabel(null);
        setSleepDeadline(null);
        setSleepOptionState("off");
        stop();
        return;
      }
      const mins = Math.floor(msLeft / 60000);
      const secs = Math.floor((msLeft % 60000) / 1000);
      setSleepRemainingLabel(`${mins}:${secs.toString().padStart(2, "0")} left`);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [sleepDeadline, stop]);

  // Shared by both the real-audio `ended` event and the TTS utterance's
  // own `onend` — either stop here (sleep timer armed for "end of this
  // chapter") or continue into the next one. A ref (not the callback
  // directly) so `speak`, declared above this, can call whichever version
  // is current without `advanceToNext`/`stop` needing to exist yet at
  // that point in the file.
  const chapterFinishedRef = useRef<() => void>(() => {});
  useEffect(() => {
    chapterFinishedRef.current = () => {
      const target = currentRef.current;
      setIsPlaying(false);
      if (sleepOptionRef.current === "end_of_chapter") {
        setSleepOptionState("off");
        setSleepRemainingLabel(null);
        stop();
        return;
      }
      if (target) advanceToNext(target);
    };
  }, [advanceToNext, stop]);

  // Real chapter recording ended, or 404'd/failed to decode — the latter
  // falls back to text-to-speech so a chapter missing its recording still
  // plays something on the very first tap, not the second.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => chapterFinishedRef.current();
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
    () => ({ current, isPlaying, isTarget, toggleListen, stop, sleepOption, sleepRemainingLabel, setSleepOption }),
    [current, isPlaying, isTarget, toggleListen, stop, sleepOption, sleepRemainingLabel, setSleepOption]
  );

  return <BibleAudioContext.Provider value={value}>{children}</BibleAudioContext.Provider>;
}

export function useBibleAudio() {
  const ctx = useContext(BibleAudioContext);
  if (!ctx) throw new Error("useBibleAudio must be used within BibleAudioProvider");
  return ctx;
}
