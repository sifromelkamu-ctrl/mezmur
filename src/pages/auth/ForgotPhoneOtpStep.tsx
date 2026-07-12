import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import OtpInput from "../../components/auth/OtpInput";
import { authService, friendlyAuthError } from "../../lib/authService";
import { haptics } from "../../utils/haptics";

interface ForgotPhoneOtpStepProps {
  phone: string;
  onVerified: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;
const CODE_EXPIRY_SECONDS = 10 * 60;

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ForgotPhoneOtpStep({ phone, onVerified }: ForgotPhoneOtpStepProps) {
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [expiresIn, setExpiresIn] = useState(CODE_EXPIRY_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
      setExpiresIn((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleVerify(fullCode: string) {
    setError(null);
    setVerifying(true);
    try {
      await authService.verifyPhoneResetOtp(phone, fullCode);
      haptics.success();
      onVerified();
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
      setCode("");
      setVerifying(false);
    }
  }

  function handleCodeChange(next: string) {
    setCode(next);
    if (next.length === 6 && !verifying) handleVerify(next);
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await authService.sendPhoneResetOtp(phone);
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

  const expired = expiresIn <= 0;

  return (
    <div className="flex flex-col flex-1 items-center text-center">
      <div className="flex-1 flex flex-col items-center gap-3 py-8">
        <div className="w-16 h-16 rounded-full bg-brand/15 flex items-center justify-center mb-2">
          <MessageSquareText size={28} className="text-brand" />
        </div>
        <h2 className="text-xl font-bold">Enter verification code</h2>
        <p className="text-sm text-fg-muted max-w-[30ch] mb-4">
          We sent a 6-digit code to <span className="text-fg font-medium">{phone}</span>
        </p>

        <OtpInput value={code} onChange={handleCodeChange} disabled={verifying} />

        <p className={`text-xs mt-2 ${expired ? "text-accent-red" : "text-fg-subtle"}`}>
          {expired ? "Code expired — request a new one" : `Expires in ${formatMMSS(expiresIn)}`}
        </p>
        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>

      <button
        onClick={handleResend}
        disabled={resending || resendCooldown > 0}
        className="bg-panel hover:bg-hover transition-colors rounded-full py-3 text-sm font-semibold disabled:opacity-50 w-full"
      >
        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
      </button>
    </div>
  );
}
