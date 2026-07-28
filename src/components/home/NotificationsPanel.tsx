import { BookOpen, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import CoverArt from "../CoverArt";
import { useAuth } from "../../context/useAuth";
import { useFavorites } from "../../context/FavoritesContext";
import { usePlayer } from "../../context/PlayerContext";
import { artistsApi, playlistsApi, tracksApi } from "../../lib/api";
import { getDailyVerse, type DailyVerse } from "../../lib/dailyVerse";
import { getDeviceId } from "../../lib/deviceId";
import { getRecentlyPlayedIds } from "../../lib/recentlyPlayed";
import { buildRecommendations, type RecommendationItem } from "../../lib/recommendations";

interface NotificationsPanelProps {
  onClose: () => void;
}

// Same well-mixed 32-bit hash as lib/dailyVerse.ts's own pick — kept as its
// own small local copy for the same reason (self-contained, no shared
// dependency to reason about across two unrelated features).
function mix32(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Picks an index into a candidate pool that: rotates twice a day (at each
// listener's own local midnight and noon, not a fixed UTC hour), is salted
// per-listener (userId, or an anonymous per-device id when logged out) so
// two people opening this the same hour don't see the same "random" pick,
// and — because it's a hash, not Math.random() — lands on the exact same
// index for the same person within that half-day window rather than
// reshuffling on every single open of the panel.
function halfDayPickIndex(salt: string, date: Date, poolSize: number): number {
  if (poolSize <= 0) return 0;
  const dayNumber = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const half = date.getHours() < 12 ? 0 : 1;
  const seed = (hashString(salt) ^ mix32(dayNumber * 2 + half)) >>> 0;
  return mix32(seed) % poolSize;
}

// The bell button's panel — a small feed of things worth surfacing right
// now rather than a real notification inbox (no read/unread history, no
// backend-driven list): today's verse (same pick as Bible's own hero card),
// one track pulled from the same personalized taste engine "Recommended for
// You" uses (not just whatever was added to the catalog most recently —
// recency alone says nothing about whether a listener would actually like
// it), and a Premium upsell. Each card is its own live fetch, loaded on
// open rather than bundled into Home's own startup fetch, since most opens
// of Home never open this panel at all.
export default function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites } = useFavorites();
  const { playTrack } = usePlayer();
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [verseLoading, setVerseLoading] = useState(true);
  const [pick, setPick] = useState<RecommendationItem | null>(null);
  const [pickLoading, setPickLoading] = useState(true);

  useEffect(() => {
    getDailyVerse()
      .then(setVerse)
      .finally(() => setVerseLoading(false));

    Promise.all([
      artistsApi.list(),
      tracksApi.list(),
      user ? playlistsApi.mine() : Promise.resolve([]),
    ])
      .then(([artists, tracks, ownedPlaylists]) => {
        const candidates = buildRecommendations(
          { artists, tracks, favoriteTracks: favorites, recentlyPlayedIds: getRecentlyPlayedIds(), ownedPlaylists },
          20
        );
        const salt = user?.id ?? getDeviceId();
        const index = halfDayPickIndex(salt, new Date(), candidates.length);
        setPick(candidates[index] ?? null);
      })
      .finally(() => setPickLoading(false));
    // Intentionally once per panel open, not live-reactive to favorites —
    // this is a single lazily-fetched pick, not a page that stays mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openVerse = () => {
    navigate("/bible");
    onClose();
  };

  const openPick = () => {
    if (!pick) return;
    // Always plays the track itself right away — this is a "give this one
    // song a listen" nudge, not a browse-the-album action, so it shouldn't
    // detour through the album page even when the track has one.
    playTrack(pick.track, [pick.track]);
    onClose();
  };

  const openSubscription = () => {
    navigate("/settings", { state: { section: "subscription" } });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-elevated rounded-t-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] max-h-[80vh] overflow-y-auto overscroll-y-contain">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Notifications</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Word of the Day — same daily pick as Bible's own hero card */}
          {!verseLoading && verse && (
            <button
              onClick={openVerse}
              className="text-left rounded-2xl p-4 bg-gradient-to-br from-gold/20 to-transparent ring-1 ring-gold/25 hover:ring-gold/40 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-1.5 text-gold text-[11px] font-bold uppercase tracking-wide mb-2">
                <Sparkles size={12} />
                Word of the Day
              </div>
              <p className="font-abyssinica text-sm leading-relaxed mb-1.5">“{verse.text}”</p>
              <p className="text-xs text-fg-muted font-semibold">{verse.ref}</p>
            </button>
          )}

          {/* One pick from the same taste-based engine "Recommended for
              You" uses — framed as a personal suggestion, not a "new
              release" claim (recency in the catalog says nothing about
              whether it's actually new music, or whether this listener
              would like it). */}
          {!pickLoading && pick && (
            <button
              onClick={openPick}
              className="flex items-center gap-3 text-left rounded-2xl p-4 bg-hover hover:bg-hover-strong transition-colors active:scale-[0.98]"
            >
              <CoverArt gradient={pick.gradient} size="sm" photoUrl={pick.photoUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-brand text-[11px] font-bold uppercase tracking-wide mb-1">
                  <Wand2 size={12} />
                  Picked For You
                </div>
                <p className="text-sm font-semibold truncate">
                  You've got great taste — give "{pick.title}" by {pick.subtitle || "this artist"} a listen.
                </p>
              </div>
            </button>
          )}

          {/* Premium upsell */}
          <button
            onClick={openSubscription}
            className="text-left rounded-2xl p-4 bg-gradient-to-br from-brand/25 to-transparent ring-1 ring-brand/30 hover:ring-brand/50 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-1.5 text-brand text-[11px] font-bold uppercase tracking-wide mb-1.5">
              <BookOpen size={12} />
              Go Premium
            </div>
            <p className="text-sm font-semibold">Enjoy Mezmur ad-free, with offline downloads and more.</p>
          </button>

          {verseLoading && pickLoading && (
            <p className="text-sm text-fg-muted text-center py-6">Loading...</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
