import { Check, Loader2, X } from "lucide-react";
import TextField from "../form/TextField";
import { useUsernameAvailability } from "../../hooks/useUsernameAvailability";

interface UsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export default function UsernameField({ value, onChange }: UsernameFieldProps) {
  const { status, suggestions } = useUsernameAvailability(value);

  return (
    <div>
      <div className="relative">
        <TextField
          type="text"
          required
          autoComplete="username"
          placeholder="Username"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="px-4 py-2 pr-10 text-base w-full"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && <Loader2 size={16} className="animate-spin text-fg-subtle" />}
          {status === "available" && <Check size={16} className="text-emerald-500" />}
          {(status === "taken" || status === "invalid") && <X size={16} className="text-accent-red" />}
        </div>
      </div>

      {status === "taken" && (
        <div className="mt-2">
          <p className="text-xs text-accent-red mb-1.5">That username is taken.</p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange(s)}
                  className="text-xs bg-panel hover:bg-hover transition-colors rounded-full px-2.5 py-1"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {status === "invalid" && value.trim() && (
        <p className="text-xs text-accent-red mt-1.5">3-20 characters: letters, numbers, _ and . only</p>
      )}
    </div>
  );
}
