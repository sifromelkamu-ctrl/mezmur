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
  console.log("[email] RESEND_API_KEY not set — email notifications are disabled.");
}

type BodyLines = (string | null | undefined | false)[];

// Best-effort only: swallows every failure (missing API key, Resend outage,
// an unverified sending domain rejecting an arbitrary recipient, ...) rather
// than throwing, since no email here should ever be able to fail the actual
// action (a message/submission being saved) it's attached to.
async function sendMail(to: string | string[], subject: string, bodyLines: BodyLines): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      text: bodyLines.filter((l): l is string => typeof l === "string").join("\n"),
    });
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${Array.isArray(to) ? to.join(", ") : to}:`, err);
  }
}

// Emails every admin/owner account (role: "admin") — never a single fixed
// address, so adding another admin automatically includes them without a
// code or env var change.
export async function notifyAdmins(subject: string, bodyLines: BodyLines): Promise<void> {
  const admins = await prisma.profile.findMany({
    where: { role: "admin", email: { not: null } },
    select: { email: true },
  });
  const recipients = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
  if (recipients.length === 0) return;
  await sendMail(recipients, subject, bodyLines);
}

// Confirmation email to whoever just submitted a song — separate from
// notifyAdmins above since this goes to an arbitrary user's address rather
// than a fixed admin account. NOTE: Resend's zero-setup default sender
// (onboarding@resend.dev, see EMAIL_FROM above) can only actually deliver
// to the Resend account's own verified email while no sending domain is
// verified — this call will silently no-op (via sendMail's own catch) for
// any other recipient until a real domain is verified with Resend. Admin
// notifications are unaffected either way, since those go to the admin's
// own address.
export async function sendSubmissionThankYou(to: string, bodyLines: BodyLines): Promise<void> {
  await sendMail(to, "Thanks for your submission — Mezmur", bodyLines);
}
