import type { AuthError } from "@supabase/supabase-js";
import { Mail } from "lucide-react";
import { useState } from "react";
import PasswordField from "../../components/auth/PasswordField";
import TextField from "../../components/form/TextField";
import { authService, friendlyAuthError } from "../../lib/authService";
import { haptics } from "../../utils/haptics";

interface LoginStepProps {
  onForgotPassword: () => void;
  // Fires instead of the normal error message when the account exists but
  // never finished verification (e.g. they closed the app before entering
  // the code) — routes back to the same code-entry screen signup would
  // have shown, rather than a dead-end "email not confirmed" error with no
  // way to actually get verified.
  onNeedsVerification: (target: { email?: string; phone?: string }) => void;
}

export default function LoginStep({ onForgotPassword, onNeedsVerification }: LoginStepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authService.loginWithEmail(email.trim(), password);
      haptics.success();
      // Session is now set; AuthContext's SIGNED_IN handler + the top-level
      // Auth orchestrator's user-watch effect take it from here.
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === "email_not_confirmed") {
        onNeedsVerification({ email: email.trim() });
        return;
      }
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
      <div className="relative">
        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
        <TextField
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="pl-11 pr-4 py-3 text-base w-full"
        />
      </div>

      <PasswordField value={password} onChange={setPassword} placeholder="Password" autoComplete="current-password" />

      <button
        type="button"
        onClick={onForgotPassword}
        className="text-sm text-fg-muted hover:text-fg transition-colors text-left -mt-1"
      >
        Forgot password?
      </button>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !email || !password}
        className="mt-2 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-brand/20"
      >
        {submitting ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}
