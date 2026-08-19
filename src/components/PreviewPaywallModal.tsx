import { Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { useSubscription } from "../context/useSubscription";
import { ApiError, subscriptionApi } from "../lib/api";

// Shown whenever PlayerContext caps playback at its 30-second preview limit
// (see PREVIEW_SECONDS there) — one instance mounted once in AppShell,
// renders nothing until that happens. Messaging/CTA branches on why the
// listener doesn't have full access: never signed up, trial ended, a
// renewal failed, or a past subscription lapsed.
export default function PreviewPaywallModal() {
  const { previewLimitReached, currentTrack } = usePlayer();
  const { user } = useAuth();
  const { status } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-show on every fresh trip past the limit (a new track hitting it
  // again after the listener closed the modal for the last one), not just
  // the first time this component ever mounts.
  useEffect(() => {
    if (previewLimitReached) {
      setDismissed(false);
      setError(null);
    }
  }, [previewLimitReached]);

  if (!previewLimitReached || dismissed) return null;

  const startCheckout = async () => {
    setError(null);
    setCheckingOut(true);
    try {
      const { url } = await subscriptionApi.checkout();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout. Please try again.");
      setCheckingOut(false);
    }
  };

  const openBillingPortal = async () => {
    setError(null);
    setCheckingOut(true);
    try {
      const { url } = await subscriptionApi.portal();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open billing. Please try again.");
      setCheckingOut(false);
    }
  };

  const isAnonymous = !user;
  const isPastDue = status?.subscriptionStatus === "past_due";
  const isLapsedSubscriber = status?.subscriptionStatus === "canceled" && !status.hasFullAccess;

  let title = "Your preview ended";
  let body = "You've heard a 30-second preview. Subscribe for unlimited full-song playback.";
  if (isAnonymous) {
    title = "Sign up to keep listening";
    body = "Create a free account for a 30-day trial with full access to every song, or subscribe directly.";
  } else if (isPastDue) {
    title = "Payment needs attention";
    body = "Your last renewal payment failed — update your billing to keep listening to full songs.";
  } else if (isLapsedSubscriber) {
    title = "Your subscription ended";
    body = "Resubscribe to keep listening to full songs, not just previews.";
  } else if (status?.subscriptionStatus === "none") {
    title = "Your free trial ended";
    body = "Subscribe for $3.99/month to keep listening to full songs, not just previews.";
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4"
      onClick={() => setDismissed(true)}
    >
      <div
        className="bg-panel rounded-2xl w-full max-w-sm p-6 relative shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setDismissed(true)}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:bg-hover transition-colors"
        >
          <X size={16} />
        </button>

        <span
          className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "color-mix(in oklab, var(--color-gold) 22%, transparent)" }}
        >
          <Lock size={22} style={{ color: "var(--color-gold)" }} />
        </span>

        <h2 className="text-lg font-bold text-fg mb-1.5">{title}</h2>
        <p className="text-sm text-fg-muted mb-1">{body}</p>
        {currentTrack && (
          <p className="text-xs text-fg-subtle mb-5 truncate">
            {currentTrack.title} — {currentTrack.artistName ?? "Unknown artist"}
          </p>
        )}
        {!currentTrack && <div className="mb-5" />}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {isAnonymous ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/auth")}
              className="w-full py-3 rounded-full font-bold text-sm text-black transition-transform active:scale-95"
              style={{ background: "var(--color-gold)" }}
            >
              Sign up free
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="w-full py-3 rounded-full font-semibold text-sm text-fg-muted hover:text-fg transition-colors"
            >
              I already have an account
            </button>
          </div>
        ) : isPastDue ? (
          <button
            onClick={openBillingPortal}
            disabled={checkingOut}
            className="w-full py-3 rounded-full font-bold text-sm text-black transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: "var(--color-gold)" }}
          >
            {checkingOut ? "Opening billing…" : "Update billing"}
          </button>
        ) : (
          <button
            onClick={startCheckout}
            disabled={checkingOut}
            className="w-full py-3 rounded-full font-bold text-sm text-black transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: "var(--color-gold)" }}
          >
            {checkingOut ? "Starting checkout…" : "Subscribe — $3.99/month"}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
