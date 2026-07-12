import { useState } from "react";
import PasswordField from "../../components/auth/PasswordField";
import PasswordStrengthMeter from "../../components/auth/PasswordStrengthMeter";
import { useAuth } from "../../context/useAuth";
import { authService, friendlyAuthError } from "../../lib/authService";
import { isPasswordValid, validateConfirmPassword } from "../../utils/authValidation";
import { haptics } from "../../utils/haptics";

interface SetNewPasswordStepProps {
  onComplete: () => void;
}

export default function SetNewPasswordStep({ onComplete }: SetNewPasswordStepProps) {
  const { refreshUser, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError("Password doesn't meet all requirements");
      return;
    }
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (confirmError) {
      setError(confirmError);
      return;
    }

    setSubmitting(true);
    try {
      await authService.setNewPassword(password);
      // Covers both entry paths: the phone-OTP flow already has a session
      // (fires SIGNED_IN on verify, before this screen), the email-link
      // flow only has a recovery session (no profile loaded yet) — this
      // hydrates it either way.
      await refreshUser();
      clearPasswordRecovery();
      haptics.success();
      onComplete();
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
      <p className="text-sm text-fg-muted -mt-2">Choose a new password for your account.</p>
      <PasswordField value={password} onChange={setPassword} placeholder="New password" />
      <PasswordStrengthMeter password={password} />
      <PasswordField
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Confirm new password"
        autoComplete="new-password"
      />

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !isPasswordValid(password) || password !== confirmPassword}
        className="mt-2 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Set New Password"}
      </button>
    </form>
  );
}
