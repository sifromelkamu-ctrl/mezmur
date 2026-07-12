import { useState } from "react";
import CountryPicker from "../../components/auth/CountryPicker";
import PasswordField from "../../components/auth/PasswordField";
import PasswordStrengthMeter from "../../components/auth/PasswordStrengthMeter";
import UsernameField from "../../components/auth/UsernameField";
import TextField from "../../components/form/TextField";
import { COUNTRIES, detectCountryFromLocale, findCountryByCode, type Country } from "../../data/countries";
import { authService, friendlyAuthError } from "../../lib/authService";
import {
  isPasswordValid,
  validateConfirmPassword,
  validatePhoneNumber,
  validateUsername,
} from "../../utils/authValidation";
import { haptics } from "../../utils/haptics";
import type { PendingSignup } from "./types";

const DEFAULT_COUNTRY: Country = findCountryByCode("ET") ?? COUNTRIES[0];

interface PhoneSignUpStepProps {
  onSwitchToEmail: () => void;
  onVerify: (pending: PendingSignup) => void;
}

export default function PhoneSignUpStep({ onSwitchToEmail, onVerify }: PhoneSignUpStepProps) {
  const [country, setCountry] = useState<Country>(() => detectCountryFromLocale() ?? DEFAULT_COUNTRY);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !validateUsername(username) &&
    !validatePhoneNumber(phone) &&
    isPasswordValid(password) &&
    password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    const phoneError = validatePhoneNumber(phone);
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (usernameError || phoneError || !isPasswordValid(password) || confirmError) {
      setError(usernameError ?? phoneError ?? confirmError ?? "Password doesn't meet all requirements");
      haptics.error();
      return;
    }

    const fullPhone = `${country.dialCode}${phone.replace(/\D/g, "")}`;
    setSubmitting(true);
    try {
      await authService.signUpWithPhone(fullPhone, password, {
        username: username.trim(),
        country: country.name,
      });
      haptics.success();
      onVerify({ username: username.trim(), phone: fullPhone, countryName: country.name });
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
        onClick={onSwitchToEmail}
        className="text-sm text-fg-muted hover:text-fg transition-colors text-center py-2"
      >
        Use email instead
      </button>
    </form>
  );
}
