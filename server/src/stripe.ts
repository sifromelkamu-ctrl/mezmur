import Stripe from "stripe";
import type { Profile } from "./generated/prisma/client.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Absent in any environment that hasn't set up billing yet (local dev
// without Stripe keys, or before the dashboard side is configured) — every
// caller checks this first and degrades gracefully rather than throwing,
// same pattern as push.ts's pushConfigured.
export const stripeConfigured = Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID && STRIPE_WEBHOOK_SECRET);

export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Whether this profile currently has full-catalog access — either an
// app-level free trial still running (no payment ever required to start
// one) or a paid Stripe subscription in a state that should grant access.
// "canceled" still counts while the already-paid-for period hasn't ended
// yet (Stripe doesn't revoke access early on cancellation); "past_due"
// does not — a failed renewal charge drops access immediately rather than
// extending a grace period, kept simple for launch.
export function hasFullAccess(
  profile: Pick<Profile, "subscriptionStatus" | "trialEndsAt" | "subscriptionCurrentPeriodEnd">
): boolean {
  const now = new Date();
  if (profile.subscriptionStatus === "active" || profile.subscriptionStatus === "trialing") return true;
  if (profile.subscriptionStatus === "canceled" && profile.subscriptionCurrentPeriodEnd && profile.subscriptionCurrentPeriodEnd > now) {
    return true;
  }
  if (profile.subscriptionStatus === "none" && profile.trialEndsAt > now) return true;
  return false;
}
