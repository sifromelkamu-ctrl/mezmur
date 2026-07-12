import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { authService, friendlyAuthError } from "../../lib/authService";
import { haptics } from "../../utils/haptics";

interface VerifyEmailStepProps {
  email: string;
  onChangeEmail: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyEmailStep({ email, onChangeEmail }: VerifyEmailStepProps) {
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleResend() {
    setStatus("sending");
    setError(null);
    try {
      await authService.resendEmailVerification(email);
      setStatus("sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      haptics.success();
    } catch (err) {
      setStatus("error");
      setError(friendlyAuthError(err));
      haptics.error();
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center text-center">
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
        <div className="w-16 h-16 rounded-full bg-brand/15 flex items-center justify-center mb-2 auth-success-icon">
          <MailCheck size={28} className="text-brand" />
        </div>
        <h2 className="text-xl font-bold">Verify your email</h2>
        <p className="text-sm text-fg-muted max-w-[30ch]">
          We sent a verification link to <span className="text-fg font-medium">{email}</span>. Click it to activate
          your account — this screen will continue automatically.
        </p>

        {status === "sent" && <p className="text-sm text-emerald-500">Verification email resent.</p>}
        {status === "error" && error && <p className="text-sm text-accent-red">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={handleResend}
          disabled={status === "sending" || cooldown > 0}
          className="bg-panel hover:bg-hover transition-colors rounded-full py-3 text-sm font-semibold disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend Verification Email (${cooldown}s)` : "Resend Verification Email"}
        </button>
        <button onClick={onChangeEmail} className="text-sm text-fg-muted hover:text-fg transition-colors py-2">
          Change Email Address
        </button>
      </div>
    </div>
  );
}
