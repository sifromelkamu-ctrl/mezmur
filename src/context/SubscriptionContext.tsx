import { useCallback, useEffect, useState, type ReactNode } from "react";
import { subscriptionApi, type ApiSubscriptionState } from "../lib/api";
import { useAuth } from "./useAuth";
import { SubscriptionContext } from "./subscription-context-value";

// Wraps the 30-day-free-trial-then-paid-subscription status the player
// gates full playback on. One shared fetch per signed-in session (rather
// than every consumer — the paywall UI, Settings, PlayerContext — hitting
// the endpoint independently), refetched whenever the signed-in user
// changes and after a checkout/portal round-trip.
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ApiSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await subscriptionApi.status();
      setStatus(state);
    } catch {
      // Leave status as-is (or null) — a transient failure here shouldn't
      // suddenly cut off someone mid-playback; the next poll/refresh tries
      // again.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasFullAccess = status?.hasFullAccess ?? false;

  return (
    <SubscriptionContext.Provider value={{ status, loading, hasFullAccess, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
