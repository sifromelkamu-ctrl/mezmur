export type AuthStep =
  | "entry"
  | "email-signup"
  | "phone-signup"
  | "verify-email"
  | "verify-phone"
  | "login"
  | "forgot-password"
  | "forgot-phone-otp"
  | "set-new-password";

// Carried between steps so e.g. the verify screen knows what to display/
// resend, and the new-password screen knows which flow (email link vs
// phone OTP) it's completing.
export interface PendingSignup {
  // Optional: unset when this is reconstructed from a login attempt on an
  // already-existing-but-unconfirmed account (see LoginStep's
  // email_not_confirmed/phone_not_confirmed handling), where the signup
  // form's username was never seen — VerifyEmailStep/VerifyPhoneStep only
  // need email/phone to resume.
  username?: string;
  email?: string;
  phone?: string;
  countryName?: string;
}
