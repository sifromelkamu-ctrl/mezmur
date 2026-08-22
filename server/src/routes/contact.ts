import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { upload, uploadImageToStorage } from "../upload.js";
import { notifyAdminsPush } from "../push.js";

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
// multipart/form-data (not JSON) since the attachment is an optional file —
// every non-file field still arrives in req.body as a plain string, same
// as every other multer-backed route in this app.
router.post("/", upload.single("attachment"), optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = submitContactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { name, email, subject, message } = parsed.data;

  let attachmentUrl: string | null = null;
  if (req.file) {
    try {
      attachmentUrl = await uploadImageToStorage(req.file.buffer, req.file.mimetype, "contact-attachments");
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Attachment upload failed" });
      return;
    }
  }

  const created = await prisma.contactMessage.create({
    data: { userId: req.userId ?? null, name: name || null, email, subject, message, attachmentUrl },
  });

  // Fire-and-forget — notifyAdminsPush swallows its own failures (see
  // push.ts), so this never delays or fails the response the sender is
  // waiting on.
  void notifyAdminsPush({
    title: "New Contact Us message",
    body: `${name || "Someone"}: ${subject}`,
    url: "/#/admin/contact-messages",
  });

  res.status(201).json({ id: created.id });
});

// GET /api/contact/mine — lets a logged-in user see their own conversations
// and every reply on each. requireAuth (unlike the public submit route
// above): a guest sender has no account to scope this list to, so there's
// nothing to look up for them — the admin inbox falls back to emailing
// those directly.
router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const messages = await prisma.contactMessage.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  res.json({ messages });
});

const replySchema = z.object({ body: z.string().trim().min(1).max(5000) });

// POST /api/contact/:id/reply — a logged-in user continuing their own
// conversation. Mirrors admin.ts's identically-shaped reply route on the
// other side of the same thread; the only real difference is the sender tag
// and who's allowed to call it (the thread's own owner here, any admin
// there). Bumps status back to "new" so it resurfaces in the admin inbox as
// needing attention again, the same way a fresh message would.
router.post("/:id/reply", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const existing = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || existing.userId !== req.userId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await prisma.contactMessage.update({
    where: { id: existing.id },
    data: { status: "new", replies: { create: { sender: "user", body: parsed.data.body } } },
  });

  void notifyAdminsPush({
    title: `${existing.name || existing.email} replied`,
    body: parsed.data.body.slice(0, 140),
    url: "/#/admin/contact-messages",
  });

  const message = await prisma.contactMessage.findUniqueOrThrow({
    where: { id: existing.id },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  res.status(201).json({ message });
});

export default router;
