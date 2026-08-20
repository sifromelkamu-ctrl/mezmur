import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthShell from "../components/auth/AuthShell";
import { useAuth } from "../context/useAuth";
import EmailSignUpStep from "./auth/EmailSignUpStep";
import EntryStep from "./auth/EntryStep";
import ForgotPasswordStep from "./auth/ForgotPasswordStep";
import ForgotPhoneOtpStep from "./auth/ForgotPhoneOtpStep";
import LoginStep from "./auth/LoginStep";
import PhoneSignUpStep from "./auth/PhoneSignUpStep";
import SetNewPasswordStep from "./auth/SetNewPasswordStep";
import type { AuthStep, PendingSignup } from "./auth/types";
import VerifyEmailStep from "./auth/VerifyEmailStep";
import VerifyPhoneStep from "./auth/VerifyPhoneStep";

const STEP_META: Record<AuthStep, { title: string; subtitle?: string }> = {
  entry: { title: "" },
  "email-signup": { title: "Create your account", subtitle: "Sign up with your email address." },
  "phone-signup": { title: "Create your account", subtitle: "Sign up with your phone number." },
  "verify-email": { title: "" },
  "verify-phone": { title: "" },
  login: { title: "Welcome back", subtitle: "Log in to continue." },
  "forgot-password": { title: "Reset your password", subtitle: "We'll help you get back in." },
  "forgot-phone-otp": { title: "" },
  "set-new-password": { title: "New password" },
};

export default function Auth() {
  const navigate = useNavigate();
  const { user, isPasswordRecovery } = useAuth();
  const [step, setStep] = useState<AuthStep>("entry");
  const [pending, setPending] = useState<PendingSignup | null>(null);
  const [resetPhone, setResetPhone] = useState<string | null>(null);

  // A clicked "reset your password" email link lands here cold (fresh page
  // load, no prior in-page state) with a recovery session already
  // established — jump straight to the new-password step rather than
  // showing the normal entry screen.
  useEffect(() => {
    if (isPasswordRecovery && step !== "set-new-password") setStep("set-new-password");
  }, [isPasswordRecovery, step]);

  // Exits the whole flow the moment a real session exists — except while
  // on "set-new-password", where the phone-reset path already has a
  // session (established by the OTP verify a step earlier) but the user
  // hasn't actually finished choosing their new password yet.
  useEffect(() => {
    if (user && step !== "set-new-password") navigate("/", { replace: true });
  }, [user, step, navigate]);

  const meta = STEP_META[step];

  function back() {
    if (step === "email-signup" || step === "phone-signup" || step === "login" || step === "forgot-password") {
      setStep("entry");
    } else if (step === "verify-email") {
      setStep("email-signup");
    } else if (step === "verify-phone") {
      setStep("phone-signup");
    } else if (step === "forgot-phone-otp") {
      setStep("forgot-password");
    } else {
      setStep("entry");
    }
  }

  return (
    <AuthShell title={meta.title} subtitle={meta.subtitle} onBack={step === "entry" ? undefined : back} stepKey={step}>
      {step === "entry" && (
        <EntryStep
          onChooseEmail={() => setStep("email-signup")}
          onChoosePhone={() => setStep("phone-signup")}
          onLogin={() => setStep("login")}
        />
      )}

      {step === "email-signup" && (
        <EmailSignUpStep
          onSwitchToPhone={() => setStep("phone-signup")}
          onVerify={(p) => {
            setPending(p);
            setStep("verify-email");
          }}
        />
      )}

      {step === "phone-signup" && (
        <PhoneSignUpStep
          onSwitchToEmail={() => setStep("email-signup")}
          onVerify={(p) => {
            setPending(p);
            setStep("verify-phone");
          }}
        />
      )}

      {step === "verify-email" && pending?.email && (
        <VerifyEmailStep email={pending.email} onChangeEmail={() => setStep("email-signup")} />
      )}

      {step === "verify-phone" && pending?.phone && (
        <VerifyPhoneStep phone={pending.phone} onChangePhone={() => setStep("phone-signup")} />
      )}

      {step === "login" && (
        <LoginStep
          onForgotPassword={() => setStep("forgot-password")}
          onNeedsVerification={(target) => {
            setPending({ username: "", ...target });
            setStep(target.phone ? "verify-phone" : "verify-email");
          }}
        />
      )}

      {step === "forgot-password" && (
        <ForgotPasswordStep
          onPhoneOtpSent={(phone) => {
            setResetPhone(phone);
            setStep("forgot-phone-otp");
          }}
        />
      )}

      {step === "forgot-phone-otp" && resetPhone && (
        <ForgotPhoneOtpStep phone={resetPhone} onVerified={() => setStep("set-new-password")} />
      )}

      {step === "set-new-password" && <SetNewPasswordStep onComplete={() => setStep("entry")} />}
    </AuthShell>
  );
}
