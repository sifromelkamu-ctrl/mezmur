import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { hasFullAccess, stripe, stripeConfigured, STRIPE_PRICE_ID } from "../stripe.js";

const router = Router();

// HashRouter (see App.tsx) — every in-app URL is a /#/... fragment, so
// Stripe's redirect URLs need to match that shape rather than a normal path.
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// GET /api/subscription/status — what the client actually gates playback
// on. hasFullAccess folds trial + subscription state into one boolean so
// the frontend never has to reimplement that logic.
router.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    subscriptionStatus: profile.subscriptionStatus,
    trialEndsAt: profile.trialEndsAt,
    subscriptionCurrentPeriodEnd: profile.subscriptionCurrentPeriodEnd,
    hasFullAccess: hasFullAccess(profile),
    billingConfigured: stripeConfigured,
  });
});

// POST /api/subscription/checkout — creates a Stripe-hosted Checkout
// session for the one subscription price and returns its URL for the
// client to redirect to. Reuses the profile's existing Stripe customer if
// this isn't their first attempt, rather than creating a new one each time.
router.post("/checkout", requireAuth, async (req: AuthedRequest, res) => {
  if (!stripeConfigured || !stripe) {
    res.status(503).json({ error: "Subscriptions aren't configured yet" });
    return;
  }
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? undefined,
        phone: profile.phone ?? undefined,
        metadata: { profileId: profile.id },
      });
      customerId = customer.id;
      await prisma.profile.update({ where: { id: profile.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${FRONTEND_URL}/#/settings?subscription=success`,
      cancel_url: `${FRONTEND_URL}/#/settings?subscription=cancelled`,
      client_reference_id: profile.id,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Failed to create checkout session:", err);
    res.status(500).json({ error: "Could not start checkout" });
  }
});

// POST /api/subscription/portal — Stripe's own hosted page for managing or
// canceling an existing subscription (update card, view invoices, cancel).
router.post("/portal", requireAuth, async (req: AuthedRequest, res) => {
  if (!stripeConfigured || !stripe) {
    res.status(503).json({ error: "Subscriptions aren't configured yet" });
    return;
  }
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile?.stripeCustomerId) {
    res.status(400).json({ error: "No billing account found yet — subscribe first" });
    return;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${FRONTEND_URL}/#/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Failed to create billing portal session:", err);
    res.status(500).json({ error: "Could not open billing portal" });
  }
});

export default router;
