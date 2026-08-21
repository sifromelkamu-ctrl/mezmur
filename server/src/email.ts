import { Resend } from "resend";
import { prisma } from "./prisma.js";

// Optional: without RESEND_API_KEY set, admin email notifications are just
// silently disabled — every call site here is best-effort and must never
// block or fail the request it's attached to (a Contact Us submission, a
// song upload), so there's no hard requirement on this being configured.
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
// Resend's own shared "onboarding@resend.dev" sender works with zero setup
// (no domain verification needed) — good enough for admin-only notification
// mail. EMAIL_FROM overrides it once a real domain is verified with Resend.
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || "Mezmur <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (!resend) {
  console.log("[email] RESEND_API_KEY not set — admin email notifications are disabled.");
}

// Emails every admin/owner account (role: "admin") — never a single fixed
// address, so adding another admin automatically includes them without a
// code or env var change. Best-effort only: swallows every failure (missing
// API key, Resend outage, an admin with no email on file, ...) rather than
// throwing, since none of this should ever be able to fail the actual
// action (a message/submission being saved) it's notifying about.
export async function notifyAdmins(subject: string, bodyLines: (string | null | undefined | false)[]): Promise<void> {
  if (!resend) return;
  try {
    const admins = await prisma.profile.findMany({
      where: { role: "admin", email: { not: null } },
      select: { email: true },
    });
    const recipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
    if (recipients.length === 0) return;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: recipients,
      subject,
      text: bodyLines.filter((l): l is string => typeof l === "string").join("\n"),
    });
  } catch (err) {
    console.error("[email] failed to send admin notification:", err);
  }
}
