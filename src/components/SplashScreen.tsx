import { useEffect, useState } from "react";
import mezmurLogo from "../assets/mezmur-logo.png";

const WORDMARK = "MEZMUR";
const LETTER_STAGGER_MS = 55;
const LETTERS_START_MS = 350;
const SHIMMER_START_MS = LETTERS_START_MS + WORDMARK.length * LETTER_STAGGER_MS + 250;
const TAGLINE_WORDS = ["Worship.", "Listen.", "Inspire."];
const TAGLINE_STAGGER_MS = 300;
const HOLD_MS = 2600;
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
            animation: `splash-progress-fill 1.4s cubic-bezier(0.4, 0, 0.2, 1) ${LETTERS_START_MS}ms forwards`,
          }}
        />
      </div>
    </div>
  );
}
