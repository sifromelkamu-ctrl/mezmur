// The one place this app calls supabase.auth.* directly for the actual
// sign-up/sign-in/verification/reset lifecycle — everything else (routing,
// forms, the profiles-table CRUD in server/src/routes/auth.ts) builds on
// top of these. Kept separate from AuthContext so the context stays about
// *state* (current user, loading) while this stays about *actions*.
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface SignUpMetadata {
  username: string;
  country?: string;
  preferredLanguage?: string;
}

function metadataPayload(meta: SignUpMetadata) {
  return {
    username: meta.username,
    country: meta.country,
    preferred_language: meta.preferredLanguage ?? "en",
  };
}

// Supabase's email confirmation / password recovery links redirect back
// here with a PKCE `?code=` param (see lib/supabase.ts for why PKCE
// specifically) — the client's own auth-state listener picks the resulting
// session up automatically once the code is exchanged.
const REDIRECT_URL = `${window.location.origin}/`;

export function friendlyAuthError(error: unknown): string {
  if (error instanceof Error) {
    const message = (error as AuthError).message ?? error.message;
    if (/already registered|already exists/i.test(message)) return "An account with that email already exists.";
    if (/invalid login credentials/i.test(message)) return "Incorrect email/phone or password.";
    if (/rate limit/i.test(message)) return "Too many attempts — please wait a moment and try again.";
    if (/token has expired|invalid otp|invalid token/i.test(message)) return "That code is invalid or has expired.";
    return message;
  }
  return "Something went wrong. Please try again.";
}

export const authService = {
  async signUpWithEmail(email: string, password: string, meta: SignUpMetadata) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadataPayload(meta), emailRedirectTo: REDIRECT_URL },
    });
    if (error) throw error;
    return data;
  },

  async resendEmailVerification(email: string) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: REDIRECT_URL },
    });
    if (error) throw error;
  },

  async resendPhoneOtp(phone: string) {
    const { error } = await supabase.auth.resend({ type: "sms", phone });
    if (error) throw error;
  },

  async verifyEmailSignup(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (error) throw error;
    return data;
  },

  async verifyPhoneSignup(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error) throw error;
    return data;
  },

  async loginWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async loginWithPhone(phone: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
    if (error) throw error;
    return data;
  },

  async sendPasswordResetEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_URL });
    if (error) throw error;
  },

  // Same 6-digit-code pattern as phone reset (and email signup) rather than
  // the link Supabase generates by default — verifying establishes a
  // recovery session directly, same as clicking the link would have.
  async verifyEmailResetOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (error) throw error;
    return data;
  },

  // Phone accounts have no reset-email equivalent — Supabase's own pattern
  // for this is: send an OTP via the passwordless sign-in call, verify it
  // (which establishes a real session for that existing user), then set a
  // new password on that now-authenticated session.
  async sendPhoneResetOtp(phone: string) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  },

  async verifyPhoneResetOtp(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error) throw error;
    return data;
  },

  async setNewPassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async signOut() {
    await supabase.auth.signOut();
  },
};
