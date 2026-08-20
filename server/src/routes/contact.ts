import { Router } from "express";
import { z } from "zod";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";

const router = Router();

const submitContactSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

// POST /api/contact - Settings > Contact Us. optionalAuth rather than
// requireAuth: a prospective user with a question before signing up should
// still be able to reach out, so the form takes a reply-to email directly
// instead of requiring login — userId is just attached when one exists.
router.post("/", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = submitContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { name, email, subject, message } = parsed.data;

  await prisma.contactMessage.create({
    data: { userId: req.userId ?? null, name: name || null, email, subject, message },
  });

  res.status(201).json({ ok: true });
});

export default router;
