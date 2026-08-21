import { Router } from "express";
import { z } from "zod";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";
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

  await prisma.contactMessage.create({
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

  res.status(201).json({ ok: true });
});

export default router;
