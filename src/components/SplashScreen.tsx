import { useEffect, useState } from "react";
import mezmurLogo from "../assets/mezmur-logo.png";

const WORDMARK = "MEZMUR";
const LETTER_STAGGER_MS = 55;
const LETTERS_START_MS = 350;
const SHIMMER_START_MS = LETTERS_START_MS + WORDMARK.length * LETTER_STAGGER_MS + 250;
const TAGLINE_WORDS = ["Worship.", "Listen.", "Inspire."];
// Each word's 0.5s pop animation peaks (scale overshoot + full opacity) at
// its own 60% mark — 300ms in — which is exactly when a 300ms stagger let
// the next word start, so the three used to visually overlap/cascade into
// each other instead of reading as a clear 1-2-3 sequence. Widening the gap
// past that peak fixes it.
const TAGLINE_STAGGER_MS = 450;
// The last tagline word finishes popping in and settles at SHIMMER_START_MS
// + 2 * TAGLINE_STAGGER_MS + 0.5s pop duration = 2330ms; this holds another
// half second past that so all three words are unmistakably shown together,
// at rest, before exiting — not just barely finished landing. Data fetching
// already starts immediately underneath this overlay (see App.tsx — the
// whole provider tree mounts regardless of showSplash), so lengthening this
// only extends the branded intro, not any real loading.
const HOLD_MS = 2830;
// Must match .splash-exiting's animation-duration in index.css (0.55s) —
// this is only the JS-side timer that unmounts the component once that CSS
// fade-out finishes, not an independent duration.
const EXIT_MS = 550;

interface SplashScreenProps {
  onFinish: () => void;
}

// Same premium teal -> emerald -> deep-black blend as the Now Playing
// screen's fixed background (see NOW_PLAYING_BACKGROUND in NowPlaying.tsx) —
// duplicated rather than imported since the two screens are otherwise
// unrelated and this is a plain visual constant. The logo glow, progress
// rail, and fill all pull from this same teal so every animated element on
// the screen reads as one cohesive palette instead of gold accents dropped
// onto an unrelated background.
const SPLASH_BACKGROUND = `linear-gradient(
  180deg,
  #1cc4a3 0%,
  #14b8a6 14%,
  #0f8f7e 32%,
  #134e4a 52%,
  #0d2f2c 70%,
  #0a1614 86%,
  #050707 100%
)`;
const SPLASH_TEAL = "#2dd4bf";
const SPLASH_TEAL_LIGHT = "#99f6e4";

// The app's cold-open splash — shown once per real page load (App mounts
// exactly once per browser load/refresh; client-side route changes never
// remount it). Mirrors the native-app splash mock: teal-to-black backdrop
// matching Now Playing, a glowing cross-and-note mark, serif wordmark, and
// a loading rail — with a letter-by-letter entrance and a one-shot foil
// shimmer for a more premium feel than a static image would give.
export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), HOLD_MS);
    const finishTimer = setTimeout(onFinish, HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 ${exiting ? "splash-exiting" : ""}`}
      style={{
        backgroundImage: SPLASH_BACKGROUND,
      }}
    >
      <div className="relative flex items-center justify-center w-24 h-24">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in oklab, ${SPLASH_TEAL_LIGHT} 55%, transparent) 0%, transparent 70%)`,
            animation: "splash-ring-pulse 1.8s ease-out 0.15s 2",
          }}
        />
        <img
          src={mezmurLogo}
          alt="Mezmur"
          className="relative w-[92px] h-[92px] rounded-2xl"
          style={{ animation: "splash-icon-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        />
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <h1
          className="font-playfair font-black text-4xl text-center"
          style={{ color: "#ffffff" }}
          aria-label="Mezmur"
        >
          {WORDMARK.split("").map((letter, i) => (
            <span
              key={i}
              className="splash-letter"
              style={{ animationDelay: `${LETTERS_START_MS + i * LETTER_STAGGER_MS}ms` }}
            >
              {letter}
            </span>
          ))}
        </h1>
        <div className="flex items-center gap-2">
          {TAGLINE_WORDS.map((word, i) => (
            <span
              key={word}
              className="text-xs font-semibold uppercase opacity-0"
              style={{
                color: SPLASH_TEAL_LIGHT,
                letterSpacing: "0.1em",
                animation: `splash-tagline-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${
                  SHIMMER_START_MS + i * TAGLINE_STAGGER_MS
                }ms forwards`,
              }}
            >
              {word}
            </span>
          ))}
        </div>
      </div>

      <div
        className="w-36 h-[3px] rounded-full overflow-hidden opacity-0"
        style={{
          background: "rgba(255,255,255,0.18)",
          animation: `splash-tagline-in 0.4s ease-out ${LETTERS_START_MS}ms forwards`,
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${SPLASH_TEAL}, ${SPLASH_TEAL_LIGHT})`,
            // Duration is HOLD_MS - LETTERS_START_MS (its own start delay),
            // not a fixed guess — that way it keeps moving at a constant
            // rate right up until the instant the splash starts exiting,
            // instead of finishing early and sitting fully filled for a few
            // hundred idle ms first, which read as the bar getting stuck.
            // Linear rather than the previous decelerating ease-out too, so
            // it doesn't visibly slow down just before that.
            animation: `splash-progress-fill ${HOLD_MS - LETTERS_START_MS}ms linear ${LETTERS_START_MS}ms forwards`,
          }}
        />
      </div>
    </div>
  );
}
