import { createContext } from "react";
import type { ApiSubscriptionState } from "../lib/api";

export interface SubscriptionContextValue {
  // Null while loading, or when signed out (no profile/trial exists for an
  // anonymous visitor — see PREVIEW_SECONDS gating in PlayerContext, which
  // treats "no status" the same as "trial expired, not subscribed").
  status: ApiSubscriptionState | null;
  loading: boolean;
  hasFullAccess: boolean;
  refresh: () => Promise<void>;
}

export const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
