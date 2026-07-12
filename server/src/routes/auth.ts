import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { supabaseAdmin } from "../supabase.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(80),
});

function toPublicUser(profile: { id: string; email: string; name: string | null; role: string }) {
  return { id: profile.id, email: profile.email, name: profile.name, role: profile.role };
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password, name } = parsed.data;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      const status = error?.status === 422 ? 409 : 400;
      res.status(status).json({ error: error?.message ?? "Could not create account" });
      return;
    }

    // The `handle_new_user` trigger auto-creates a matching `profiles` row;
    // patch in the display name if one was provided.
    const profile = name
      ? await prisma.profile.update({ where: { id: data.user.id }, data: { name } })
      : await prisma.profile.findUniqueOrThrow({ where: { id: data.user.id } });

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !signIn.session) {
      res.status(500).json({ error: "Account created but sign-in failed" });
      return;
    }

    res.status(201).json({
      token: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      user: toPublicUser(profile),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
    if (!profile) {
      res.status(404).json({ error: "Profile not found for this account" });
      return;
    }

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toPublicUser(profile),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Login failed" });
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: req.userId! } });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: toPublicUser(profile) });
});

router.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const profile = await prisma.profile.update({
    where: { id: req.userId! },
    data: { name: parsed.data.name },
  });
  res.json({ user: toPublicUser(profile) });
});

export default router;
