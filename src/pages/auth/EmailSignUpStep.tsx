import { useState } from "react";
import TextField from "../../components/form/TextField";
import PasswordField from "../../components/auth/PasswordField";
import PasswordStrengthMeter from "../../components/auth/PasswordStrengthMeter";
import UsernameField from "../../components/auth/UsernameField";
import { authService, friendlyAuthError } from "../../lib/authService";
import { detectCountryFromLocale } from "../../data/countries";
import {
  isPasswordValid,
  validateConfirmPassword,
  validateEmail,
  validateUsername,
} from "../../utils/authValidation";
import { haptics } from "../../utils/haptics";
import type { PendingSignup } from "./types";

interface EmailSignUpStepProps {
  onSwitchToPhone: () => void;
  onVerify: (pending: PendingSignup) => void;
}

export default function EmailSignUpStep({ onSwitchToPhone, onVerify }: EmailSignUpStepProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !validateUsername(username) && !validateEmail(email) && isPasswordValid(password) && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    const emailError = validateEmail(email);
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (usernameError || emailError || !isPasswordValid(password) || confirmError) {
      setError(usernameError ?? emailError ?? confirmError ?? "Password doesn't meet all requirements");
      haptics.error();
      return;
    }

    setSubmitting(true);
    try {
      await authService.signUpWithEmail(email.trim(), password, {
        username: username.trim(),
        country: detectCountryFromLocale()?.name,
      });
      haptics.success();
      onVerify({ username: username.trim(), email: email.trim() });
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
      <UsernameField value={username} onChange={setUsername} />
      <TextField
        type="email"
        required
        autoComplete="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="px-4 py-2.5 text-base w-full"
      />
      <PasswordField value={password} onChange={setPassword} placeholder="Password" />
      <PasswordStrengthMeter password={password} />
      <PasswordField
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Confirm password"
        autoComplete="new-password"
      />

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !canSubmit}
        className="mt-2 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100"
      >
        {submitting ? "Creating account..." : "Sign Up"}
      </button>

      <button
        type="button"
        onClick={onSwitchToPhone}
        className="text-sm text-fg-muted hover:text-fg transition-colors text-center py-2"
      >
        Use phone number instead
      </button>
    </form>
  );
}
