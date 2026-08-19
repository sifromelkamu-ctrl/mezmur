import { Router } from "express";
import type Stripe from "stripe";
import { prisma } from "../prisma.js";
import { stripe, stripeConfigured, STRIPE_WEBHOOK_SECRET } from "../stripe.js";
import type { SubscriptionStatus } from "../generated/prisma/client.js";

const router = Router();

// Stripe's own subscription statuses don't map 1:1 onto our simpler enum
// (only the ones hasFullAccess/the UI actually branch on) — "unpaid" reads
// the same as "past_due" here (a failed renewal either way), and the two
// "incomplete" states (an initial payment that never went through) are
// treated as never having subscribed at all rather than adding a status
// nothing else in the app checks for.
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "none";
    default:
      return "none";
  }
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodEndSeconds = subscription.items.data[0]?.current_period_end;

  const result = await prisma.profile.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapStatus(subscription.status),
      subscriptionCurrentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
    },
  });

  if (result.count === 0) {
    console.error(`Stripe webhook: no profile found for customer ${customerId} (subscription ${subscription.id})`);
  }
}

// POST /api/webhooks/stripe — mounted in index.ts with express.raw() BEFORE
// the app-wide express.json(), since signature verification needs the exact
// raw request bytes Stripe signed, not a re-serialized parsed body.
router.post("/", async (req, res) => {
  if (!stripeConfigured || !stripe || !STRIPE_WEBHOOK_SECRET) {
    res.status(503).send("Webhook not configured");
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing Stripe-Signature header");
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    switch (event.type) {
      // The subscription object itself (created/updated/deleted) is the
      // source of truth for status/period-end — checkout.session.completed
      // only confirms the checkout flow finished, so nothing to do beyond
      // acknowledging it (the customer <-> profile link is already set at
      // checkout-session creation time in routes/subscription.ts).
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    res.status(500).send("Webhook handler error");
  }
});

export default router;
