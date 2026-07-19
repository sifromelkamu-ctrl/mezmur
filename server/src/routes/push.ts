import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { getVapidPublicKey, pushConfigured } from "../push.js";

const router = Router();

router.get("/public-key", (_req, res) => {
  if (!pushConfigured) {
    res.status(503).json({ error: "Push notifications are not configured on this server" });
    return;
  }
  res.json({ publicKey: getVapidPublicKey() });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Upserts by endpoint (the Push API's own unique subscription URL) — a user
// re-subscribing the same device (e.g. after clearing permission and
// re-granting it) just refreshes the keys rather than creating a duplicate.
router.post("/subscribe", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(204).end();
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

router.post("/unsubscribe", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  // Scoped to the caller's own userId so one user can't unsubscribe
  // another's device by guessing/observing an endpoint URL.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: req.userId! } });
  res.status(204).end();
});

// Lets the client know whether the current device is already subscribed,
// so the bell can show the right on/off state after a reload without
// re-deriving it from the browser's own (async) PushManager APIs alone.
router.get("/subscribed", requireAuth, async (req: AuthedRequest, res) => {
  const endpoint = typeof req.query.endpoint === "string" ? req.query.endpoint : undefined;
  if (!endpoint) {
    res.json({ subscribed: false });
    return;
  }
  const existing = await prisma.pushSubscription.findFirst({ where: { endpoint, userId: req.userId! } });
  res.json({ subscribed: Boolean(existing) });
});

export default router;
