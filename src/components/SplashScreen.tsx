import { useEffect, useState } from "react";

const WORDMARK = "MEZMUR";
const LETTER_STAGGER_MS = 55;
const LETTERS_START_MS = 350;
const SHIMMER_START_MS = LETTERS_START_MS + WORDMARK.length * LETTER_STAGGER_MS + 250;
const HOLD_MS = 2200;
const EXIT_MS = 550;

interface SplashScreenProps {
  onFinish: () => void;
}

// The app's cold-open splash — shown once per real page load (App mounts
// exactly once per browser load/refresh; client-side route changes never
// remount it). Mirrors the native-app splash mock: cream backdrop, a
// gold cross-and-note mark, serif wordmark, and a loading rail — with a
// letter-by-letter entrance and a one-shot foil shimmer for a more
// premium feel than a static image would give.
export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [shimmer, setShimmer] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const shimmerTimer = setTimeout(() => setShimmer(true), SHIMMER_START_MS);
    const exitTimer = setTimeout(() => setExiting(true), HOLD_MS);
    const finishTimer = setTimeout(onFinish, HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(shimmerTimer);
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 ${exiting ? "splash-exiting" : ""}`}
      style={{
        background: "radial-gradient(circle at 50% 38%, #fffdf8 0%, #faf5e9 55%, #f5ecd8 100%)",
      }}
    >
      <div className="relative flex items-center justify-center w-24 h-24">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(212,175,55,0.35) 0%, rgba(212,175,55,0) 70%)",
            animation: "splash-ring-pulse 1.8s ease-out 0.15s 2",
          }}
        />
        <svg
          viewBox="0 0 120 120"
          className="relative w-16 h-16"
          style={{ animation: "splash-icon-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <defs>
            <linearGradient id="splashGold" x1="20%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor="#f7e0a0" />
              <stop offset="45%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#a9862b" />
            </linearGradient>
          </defs>
          <path
            d="M60,16 C77,20 83,31 82,45"
            fill="none"
            stroke="url(#splashGold)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <rect x="52" y="10" width="8" height="88" rx="4" fill="url(#splashGold)" />
          <rect x="33" y="27" width="38" height="8" rx="4" fill="url(#splashGold)" />
          <rect x="75" y="45" width="7" height="52" rx="3.5" fill="url(#splashGold)" />
          <ellipse cx="56" cy="103" rx="13" ry="10" fill="url(#splashGold)" transform="rotate(-18 56 103)" />
          <ellipse cx="79" cy="95" rx="10" ry="8" fill="url(#splashGold)" transform="rotate(-18 79 95)" />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <h1
          className={`font-playfair font-black text-4xl text-center ${shimmer ? "text-shimmer-gold" : ""}`}
          style={!shimmer ? { color: "#1f1a17" } : undefined}
          aria-label="Mezmur"
        >
          {/* -webkit-background-clip:text on this h1 (for the shimmer look)
              can't paint through the per-letter spans below — they're
              display:inline-block (needed so translateY works on each
              letter), which gives each one its own box the parent's
              background-clip can't reach, leaving them invisible. By the
              time `shimmer` flips true every letter has already finished
              its entrance, so swapping to a plain text node here is
              visually seamless and sidesteps the clip issue entirely. */}
          {shimmer
            ? WORDMARK
            : WORDMARK.split("").map((letter, i) => (
                <span
                  key={i}
                  className="splash-letter"
                  style={{ animationDelay: `${LETTERS_START_MS + i * LETTER_STAGGER_MS}ms` }}
                >
                  {letter}
                </span>
              ))}
        </h1>
        <p
          className="text-xs font-semibold uppercase opacity-0"
          style={{
            color: "#a9862b",
            letterSpacing: "0.28em",
            animation: `splash-tagline-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${SHIMMER_START_MS}ms forwards`,
          }}
        >
          Worship. Listen. Inspire.
        </p>
      </div>

      <div
        className="w-36 h-[3px] rounded-full overflow-hidden opacity-0"
        style={{
          background: "rgba(169,134,43,0.18)",
          animation: `splash-tagline-in 0.4s ease-out ${LETTERS_START_MS}ms forwards`,
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #d4af37, #f7e0a0)",
            animation: `splash-progress-fill 1.4s cubic-bezier(0.4, 0, 0.2, 1) ${LETTERS_START_MS}ms forwards`,
          }}
        />
      </div>
    </div>
  );
}
