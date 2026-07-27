import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tracksApi, type ApiTrack } from "../lib/api";
import { eventAppliesToTrack, onArtworkChanged } from "../lib/artworkEvents";
import { recordPlayed, recordPosition } from "../lib/recentlyPlayed";
import { applyTrackMetadataPatch, onTrackMetadataChanged } from "../lib/trackMetadataEvents";

interface PlayerContextValue {
  currentTrack: ApiTrack | null;
  queue: ApiTrack[];
  isPlaying: boolean;
  volume: number; // 0-1
  shuffle: boolean;
  repeat: boolean;
  playTrack: (track: ApiTrack, queue?: ApiTrack[]) => void;
  addToQueue: (track: ApiTrack) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);
// Split out from PlayerContextValue on purpose: `progress` changes every
// ~1s (or several times/sec for real audio via `timeupdate`), while every
// other field changes rarely. Every screen/list reads currentTrack/queue/
// isPlaying/controls but never progress — only the mini player and the
// full-screen Now Playing sheet need live progress — so keeping it in the
// same context as everything else re-rendered every TrackRow on screen on
// every tick. This context exists purely so those two consumers can
// subscribe to progress without dragging the rest of the app along.
const PlayerProgressContext = createContext<number | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<ApiTrack | null>(null);
  const [queue, setQueue] = useState<ApiTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Kept in sync via the effect below so the timeupdate listener (attached
  // once, not re-attached per track — see its own comment) always reads the
  // live track without needing to be in that effect's dependency array.
  const currentTrackRef = useRef<ApiTrack | null>(null);
  const lastSavedPositionSecondRef = useRef<number>(-1);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    lastSavedPositionSecondRef.current = -1;
  }, [currentTrack]);

  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  // Without this, an old <audio> element from a previous mount of this
  // provider (a Fast Refresh reload during dev, or any other unmount/remount)
  // is never paused — it's a plain browser object with no tie to React's
  // lifecycle, so it just keeps playing in the background even after being
  // orphaned, while the newly-mounted provider creates and plays a second
  // one. That's exactly what "two songs playing at once" was: two separate
  // Audio elements, only one of which any visible UI still controlled.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      audioRef.current = null;
    };
  }, []);

  // Most of the catalog has no real audio file yet (only tracks uploaded
  // through the admin flow do) — those fall back to the simulated timer
  // below so nothing regresses for existing content.
  const hasRealAudio = Boolean(currentTrack?.audioUrl);

  const playTrack = useCallback((track: ApiTrack, newQueue?: ApiTrack[]) => {
    setCurrentTrack(track);
    setQueue(newQueue && newQueue.length ? newQueue : [track]);
    setProgress(0);
    setIsPlaying(true);
    tracksApi.recordPlay(track.id).catch(() => {});
    recordPlayed(track.id);
  }, []);

  // Appends to the existing queue without disturbing playback — playTrack
  // above still fully replaces the queue, this is purely an additive way to
  // queue something up next (used by the Songs page's "Add to queue" menu
  // item; QueuePanel already renders whatever's in `queue` so it picks this
  // up with no changes of its own).
  const addToQueue = useCallback((track: ApiTrack) => {
    setQueue((q) => (q.length ? [...q, track] : [track]));
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      if (!currentTrack) return p;
      return !p;
    });
  }, [currentTrack]);

  const jump = useCallback(
    (direction: 1 | -1) => {
      if (!currentTrack || queue.length === 0) return;
      const idx = queue.findIndex((t) => t.id === currentTrack.id);
      if (idx === -1) return;
      let nextIdx: number;
      if (shuffle) {
        nextIdx = Math.floor(Math.random() * queue.length);
      } else {
        nextIdx = (idx + direction + queue.length) % queue.length;
      }
      const nextTrack = queue[nextIdx];
      setCurrentTrack(nextTrack);
      setProgress(0);
      setIsPlaying(true);
      tracksApi.recordPlay(nextTrack.id).catch(() => {});
    },
    [currentTrack, queue, shuffle]
  );

  const next = useCallback(() => jump(1), [jump]);
  const prev = useCallback(() => jump(-1), [jump]);

  const seek = useCallback(
    (seconds: number) => {
      if (audioRef.current && hasRealAudio) {
        audioRef.current.currentTime = seconds;
      }
      setProgress(seconds);
    },
    [hasRealAudio]
  );

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const toggleRepeat = useCallback(() => setRepeat((r) => !r), []);

  useEffect(() => {
    const root = document.documentElement;
    if (currentTrack) {
      root.style.setProperty("--color-ambient-1", currentTrack.gradient[0]);
      root.style.setProperty("--color-ambient-2", currentTrack.gradient[1]);
    } else {
      root.style.removeProperty("--color-ambient-1");
      root.style.removeProperty("--color-ambient-2");
    }
  }, [currentTrack]);

  // Exposes the current track to the OS-level media surface (lock screen,
  // notification shade, hardware/earbud buttons) — metadata only, no change
  // to playback itself. Action handlers just call the same functions the
  // in-app buttons already call.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artistName ?? "",
      album: currentTrack.albumTitle ?? "",
      artwork: currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: "512x512", type: "image/jpeg" }] : [],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => togglePlay());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) seek(details.seekTime);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [togglePlay, prev, next, seek]);

  // Load whichever track is current into the real <audio> element. Tracks
  // without an audioUrl explicitly stop/unload it so stale audio can't keep
  // playing underneath the simulated-timer fallback.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack?.audioUrl) {
      audio.src = currentTrack.audioUrl;
      audio.currentTime = 0;
      audio.volume = volume;
      if (isPlaying) audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.audioUrl]);

  // Play/pause the real audio element in lockstep with isPlaying.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasRealAudio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, hasRealAudio]);

  // Saves an exact position on pause, real audio or simulated alike — the
  // periodic saves elsewhere only land every 5s, so a deliberate pause
  // could otherwise be off by up to that much when the listener comes back.
  useEffect(() => {
    if (!isPlaying && currentTrackRef.current) {
      recordPosition(currentTrackRef.current.id, progress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Real audio drives progress/ended off its own events rather than a timer.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      // Throttled to once per ~5s of playback (not every timeupdate tick,
      // which fires several times a second) — powers Home's Continue
      // Listening progress bars without hammering localStorage.
      const sec = Math.floor(audio.currentTime);
      if (sec > 0 && sec % 5 === 0 && sec !== lastSavedPositionSecondRef.current) {
        lastSavedPositionSecondRef.current = sec;
        if (currentTrackRef.current) recordPosition(currentTrackRef.current.id, audio.currentTime);
      }
    };
    const handleEnded = () => {
      if (repeat) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setProgress(0);
      } else {
        next();
      }
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [repeat, next]);

  // Simulated playback fallback for tracks with no real audio file — most
  // of the catalog, so this needs the same throttled position save the
  // real-audio timeupdate handler gets above, or Continue Listening's
  // progress bars would only ever work for the handful of admin-uploaded
  // tracks with a real audioUrl.
  useEffect(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (isPlaying && currentTrack && !hasRealAudio) {
      intervalRef.current = window.setInterval(() => {
        setProgress((p) => {
          const duration = currentTrack.duration ?? 0;
          const nextP = p + 1;
          if (nextP >= duration) {
            if (repeat) {
              recordPosition(currentTrack.id, 0);
              return 0;
            }
            window.setTimeout(() => next(), 0);
            return 0;
          }
          if (nextP % 5 === 0) recordPosition(currentTrack.id, nextP);
          return nextP;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentTrack, repeat, next, hasRealAudio]);

  // "No manual refresh required": patches currentTrack/queue the instant an
  // album or track's artwork is saved elsewhere in the app (Mini Player,
  // Now Playing, and the queue panel all read from this same state, so one
  // patch here reaches all of them) — otherwise a track already loaded into
  // the player would keep showing its stale artwork until the next natural
  // re-fetch, which for a currently-playing track might never happen.
  useEffect(() => {
    return onArtworkChanged((event) => {
      const applyPatch = (track: ApiTrack): ApiTrack =>
        eventAppliesToTrack(event, track)
          ? {
              ...track,
              ...(event.patch.coverUrl !== undefined ? { coverUrl: event.patch.coverUrl ?? undefined } : {}),
              ...(event.patch.artworkFrame !== undefined ? { artworkFrame: event.patch.artworkFrame ?? undefined } : {}),
            }
          : track;
      setCurrentTrack((track) => (track ? applyPatch(track) : track));
      setQueue((q) => q.map(applyPatch));
    });
  }, []);

  // Same "no manual refresh required" reasoning as the artwork subscription
  // above, for a title/artist-name edit instead of a cover image.
  useEffect(() => {
    return onTrackMetadataChanged((event) => {
      setCurrentTrack((track) => (track ? applyTrackMetadataPatch(event, track) : track));
      setQueue((q) => q.map((track) => applyTrackMetadataPatch(event, track)));
    });
  }, []);

  const value = useMemo(
    () => ({
      currentTrack,
      queue,
      isPlaying,
      volume,
      shuffle,
      repeat,
      playTrack,
      addToQueue,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      toggleRepeat,
    }),
    [
      currentTrack,
      queue,
      isPlaying,
      volume,
      shuffle,
      repeat,
      playTrack,
      addToQueue,
      togglePlay,
      next,
      prev,
      seek,
      toggleShuffle,
      toggleRepeat,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressContext.Provider value={progress}>{children}</PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

// Only the mini player and Now Playing sheet should call this — every other
// consumer should use usePlayer() so it isn't re-rendered on every progress
// tick (see PlayerProgressContext's own comment above).
export function usePlayerProgress() {
  const progress = useContext(PlayerProgressContext);
  if (progress === null) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return progress;
}
