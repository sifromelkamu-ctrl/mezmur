import { Check, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import OtpInput from "../../components/auth/OtpInput";
import { authService, friendlyAuthError } from "../../lib/authService";
import { haptics } from "../../utils/haptics";

interface VerifyPhoneStepProps {
  phone: string;
  onChangePhone: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;
const CODE_EXPIRY_SECONDS = 10 * 60;

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VerifyPhoneStep({ phone, onChangePhone }: VerifyPhoneStepProps) {
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [expiresIn, setExpiresIn] = useState(CODE_EXPIRY_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
      setExpiresIn((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const expired = expiresIn <= 0;

  async function handleVerify(fullCode: string) {
    setError(null);
    setVerifying(true);
    try {
      await authService.verifyPhoneSignup(phone, fullCode);
      setSuccess(true);
      haptics.success();
      // The resulting session fires AuthContext's SIGNED_IN handler, which
      // loads the profile and exits this flow automatically — nothing else
      // to do here.
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  function handleCodeChange(next: string) {
    setCode(next);
    if (next.length === 6 && !verifying && !success) handleVerify(next);
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await authService.resendPhoneOtp(phone);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setExpiresIn(CODE_EXPIRY_SECONDS);
      setCode("");
      haptics.success();
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center text-center">
      <div className="flex-1 flex flex-col items-center gap-3 py-8">
        <div className="w-16 h-16 rounded-full bg-brand/15 flex items-center justify-center mb-2">
          {success ? (
            <Check size={28} className="text-emerald-500 auth-success-icon" />
          ) : (
            <MessageSquareText size={28} className="text-brand" />
          )}
        </div>
        <h2 className="text-xl font-bold">Enter verification code</h2>
        <p className="text-sm text-fg-muted max-w-[30ch] mb-4">
          We sent a 6-digit code to <span className="text-fg font-medium">{phone}</span>
        </p>

        <OtpInput value={code} onChange={handleCodeChange} disabled={verifying || success} />

        <p className={`text-xs mt-2 ${expired ? "text-accent-red" : "text-fg-subtle"}`}>
          {expired ? "Code expired — request a new one" : `Expires in ${formatMMSS(expiresIn)}`}
        </p>

        {error && <p className="text-sm text-accent-red">{error}</p>}
        {success && <p className="text-sm text-emerald-500">Phone verified — signing you in...</p>}
      </div>

      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={handleResend}
          disabled={resending || resendCooldown > 0 || success}
          className="bg-elevated ring-1 ring-border hover:bg-hover transition-colors rounded-full py-3 text-sm font-semibold disabled:opacity-50"
        >
          {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
        </button>
        <button
          onClick={onChangePhone}
          disabled={success}
          className="text-sm text-fg-muted hover:text-fg transition-colors py-2 disabled:opacity-50"
        >
          Change Phone Number
        </button>
      </div>
    </div>
  );
}
