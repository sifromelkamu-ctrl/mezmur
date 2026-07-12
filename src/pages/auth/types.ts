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
  username: string;
  email?: string;
  phone?: string;
  countryName?: string;
}
