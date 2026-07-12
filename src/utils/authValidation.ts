// Client-side validation for the auth forms — mirrors (but does not replace)
// the server's own checks in server/src/routes/auth.ts and whatever
// Supabase Auth itself enforces; this layer only exists to give the user
// instant feedback while typing, never as the actual security boundary.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email address";
  return null;
}

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return "Username is required";
  if (trimmed.length < 3 || trimmed.length > 20) return "Username must be 3-20 characters";
  if (!USERNAME_RE.test(trimmed)) return "Only letters, numbers, underscores, and periods allowed";
  return null;
}

export function validatePhoneNumber(nationalNumber: string): string | null {
  const digitsOnly = nationalNumber.replace(/\D/g, "");
  if (!digitsOnly) return "Phone number is required";
  if (digitsOnly.length < 4 || digitsOnly.length > 14) return "Enter a valid phone number";
  return null;
}

export interface PasswordRuleResult {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function checkPasswordRules(password: string): PasswordRuleResult {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const rules = checkPasswordRules(password);
  return Object.values(rules).every(Boolean);
}

export function validatePassword(password: string): string | null {
  return isPasswordValid(password) ? null : "Password doesn't meet all requirements";
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Confirm your password";
  if (password !== confirm) return "Passwords don't match";
  return null;
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

// A simple, transparent scorer (length + character-class variety) — not
// trying to be a full entropy estimator, just enough to drive a 4-step
// meter that reacts sensibly as the user types.
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return "weak";
  const rules = checkPasswordRules(password);
  const classCount = [rules.hasUppercase, rules.hasLowercase, rules.hasNumber, rules.hasSpecial].filter(
    Boolean
  ).length;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  score += classCount;

  if (score <= 2) return "weak";
  if (score <= 4) return "fair";
  if (score <= 6) return "good";
  return "strong";
}
