import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";

const router = Router();

// Registration, login, OTP send/verify, and password reset all now go
// straight from the client to Supabase Auth (see src/lib/supabase.ts and
// src/services/authService.ts) — that's the component that actually knows
// how to send verification links/SMS codes, enforce its own confirmation
// requirements, and manage session tokens, none of which this server needs
// to (or safely can) reimplement. This router is left with exactly the
// things that operate on our own `profiles` table.

const updateMeSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_.]+$/, "Username can only contain letters, numbers, underscores, and periods")
    .optional(),
  bio: z.string().trim().max(300).optional(),
  country: z.string().trim().max(80).optional(),
  preferredLanguage: z.string().trim().min(2).max(10).optional(),
  avatarUrl: z.string().url().optional(),
});

function toPublicUser(profile: {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  preferredLanguage: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}) {
  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone,
    username: profile.username,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    country: profile.country,
    preferredLanguage: profile.preferredLanguage,
    role: profile.role,
    createdAt: profile.createdAt,
    lastLoginAt: profile.lastLoginAt,
  };
}

// Applied only to the two endpoints below that are safe for an unauthenticated
// caller to hit repeatedly (no password/OTP guessing surface here — Supabase
// Auth itself rate-limits the actual sign-in/OTP endpoints), just to prevent
// username-enumeration/scraping abuse.
const publicAuthLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const usernameQuerySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_.]+$/),
});

async function isUsernameTaken(username: string, excludeId?: string) {
  const existing = await prisma.profile.findFirst({
    where: {
      username: { equals: username, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

// Deterministic-ish, human-friendly suggestions when the requested username
// is taken: a few short numeric suffixes, checked in parallel and returned
// in order. Not exhaustive — just enough for a "pick one of these" UI.
async function suggestUsernames(base: string): Promise<string[]> {
  const candidates = [
    `${base}${Math.floor(Math.random() * 90 + 10)}`,
    `${base}_${Math.floor(Math.random() * 900 + 100)}`,
    `${base}${new Date().getFullYear()}`,
    `${base}.official`,
    `the_real_${base}`,
  ].slice(0, 5);

  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      taken: candidate.length > 20 ? true : await isUsernameTaken(candidate),
    }))
  );
  return results.filter((r) => !r.taken).map((r) => r.candidate);
}

// GET /api/auth/username-availability?username=foo — live-typing check used
// by the sign-up forms. Returns suggestions only when taken, so the happy
// path (available) stays a single fast query.
router.get("/username-availability", publicAuthLimiter, async (req, res) => {
  const parsed = usernameQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid username" });
    return;
  }
  const { username } = parsed.data;
  const taken = await isUsernameTaken(username);
  if (!taken) {
    res.json({ available: true });
    return;
  }
  const suggestions = await suggestUsernames(username);
  res.json({ available: false, suggestions });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: toPublicUser(profile) });
});

// Called once, right after a signup's email/phone verification succeeds (or
// on every login — see authService.ts) to stamp lastLoginAt. Folded into
// this same PATCH rather than a separate endpoint since it's just another
// profile field from the DB's point of view.
router.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  if (parsed.data.username && (await isUsernameTaken(parsed.data.username, req.userId!))) {
    res.status(409).json({ error: "That username is already taken" });
    return;
  }
  try {
    const profile = await prisma.profile.update({
      where: { id: req.userId! },
      data: parsed.data,
    });
    res.json({ user: toPublicUser(profile) });
  } catch {
    res.status(500).json({ error: "Could not update profile" });
  }
});

// POST /api/auth/touch-login — stamps lastLoginAt = now(). Kept separate
// from PATCH /me so the client can call it unconditionally right after every
// successful sign-in without needing to send/validate any body.
router.post("/touch-login", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.profile.update({
    where: { id: req.userId! },
    data: { lastLoginAt: new Date() },
  });
  res.json({ user: toPublicUser(profile) });
});

export default router;
