import { Mail, Phone } from "lucide-react";
import { useState } from "react";
import CountryPicker from "../../components/auth/CountryPicker";
import TextField from "../../components/form/TextField";
import { COUNTRIES, detectCountryFromLocale, findCountryByCode, type Country } from "../../data/countries";
import { authService, friendlyAuthError } from "../../lib/authService";
import { validateEmail, validatePhoneNumber } from "../../utils/authValidation";
import { haptics } from "../../utils/haptics";

const DEFAULT_COUNTRY: Country = findCountryByCode("ET") ?? COUNTRIES[0];

type Method = "choose" | "email" | "phone";

interface ForgotPasswordStepProps {
  onEmailOtpSent: (email: string) => void;
  onPhoneOtpSent: (phone: string) => void;
}

export default function ForgotPasswordStep({ onEmailOtpSent, onPhoneOtpSent }: ForgotPasswordStepProps) {
  const [method, setMethod] = useState<Method>("choose");
  const [country, setCountry] = useState<Country>(() => detectCountryFromLocale() ?? DEFAULT_COUNTRY);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authService.sendPasswordResetEmail(email.trim());
      haptics.success();
      onEmailOtpSent(email.trim());
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneError = validatePhoneNumber(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setError(null);
    setSubmitting(true);
    const fullPhone = `${country.dialCode}${phone.replace(/\D/g, "")}`;
    try {
      await authService.sendPhoneResetOtp(fullPhone);
      haptics.success();
      onPhoneOtpSent(fullPhone);
    } catch (err) {
      setError(friendlyAuthError(err));
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  if (method === "choose") {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setMethod("email")}
          className="flex items-center gap-3 bg-elevated ring-1 ring-border hover:bg-hover transition-colors rounded-xl px-4 py-3.5 text-left"
        >
          <Mail size={20} className="text-brand shrink-0" />
          <div>
            <p className="font-semibold text-sm">Reset via Email</p>
            <p className="text-xs text-fg-muted">We'll send a 6-digit code by email</p>
          </div>
        </button>
        <button
          onClick={() => setMethod("phone")}
          className="flex items-center gap-3 bg-elevated ring-1 ring-border hover:bg-hover transition-colors rounded-xl px-4 py-3.5 text-left"
        >
          <Phone size={20} className="text-brand shrink-0" />
          <div>
            <p className="font-semibold text-sm">Reset via Phone</p>
            <p className="text-xs text-fg-muted">We'll send a 6-digit code by SMS</p>
          </div>
        </button>
      </div>
    );
  }

  if (method === "email") {
    return (
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted -mt-2">Enter your email and we'll send a verification code.</p>
        <TextField
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-2.5 text-base w-full"
        />
        {error && <p className="text-sm text-accent-red">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !email}
          className="mt-1 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Send Code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted -mt-2">Enter your phone number and we'll send a verification code.</p>
      <div className="flex gap-2">
        <CountryPicker value={country} onChange={setCountry} />
        <TextField
          type="tel"
          required
          autoComplete="tel-national"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="px-4 py-2.5 text-base w-full"
        />
      </div>
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !phone}
        className="mt-1 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send Code"}
      </button>
    </form>
  );
}
