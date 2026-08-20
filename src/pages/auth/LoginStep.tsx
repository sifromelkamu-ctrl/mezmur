import type { AuthError } from "@supabase/supabase-js";
import { useState } from "react";
import CountryPicker from "../../components/auth/CountryPicker";
import PasswordField from "../../components/auth/PasswordField";
import TextField from "../../components/form/TextField";
import { COUNTRIES, detectCountryFromLocale, findCountryByCode, type Country } from "../../data/countries";
import { authService, friendlyAuthError } from "../../lib/authService";
import { haptics } from "../../utils/haptics";

const DEFAULT_COUNTRY: Country = findCountryByCode("ET") ?? COUNTRIES[0];

type LoginMethod = "email" | "phone";

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
  const [method, setMethod] = useState<LoginMethod>("email");
  const [country, setCountry] = useState<Country>(() => detectCountryFromLocale() ?? DEFAULT_COUNTRY);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (method === "email") {
        await authService.loginWithEmail(email.trim(), password);
      } else {
        await authService.loginWithPhone(`${country.dialCode}${phone.replace(/\D/g, "")}`, password);
      }
      haptics.success();
      // Session is now set; AuthContext's SIGNED_IN handler + the top-level
      // Auth orchestrator's user-watch effect take it from here.
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === "email_not_confirmed") {
        onNeedsVerification({ email: email.trim() });
        return;
      }
      if (code === "phone_not_confirmed") {
        onNeedsVerification({ phone: `${country.dialCode}${phone.replace(/\D/g, "")}` });
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
      <div className="flex bg-panel rounded-full p-1 mb-1">
        {(["email", "phone"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${
              method === m ? "bg-elevated text-fg shadow" : "text-fg-muted"
            }`}
          >
            {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>

      {method === "email" ? (
        <TextField
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-2.5 text-base w-full"
        />
      ) : (
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
      )}

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
        disabled={submitting || !password || (method === "email" ? !email : !phone)}
        className="mt-2 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100"
      >
        {submitting ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}
