import { checkPasswordRules, passwordStrength } from "../../utils/authValidation";

const STRENGTH_CONFIG = {
  weak: { label: "Weak", color: "bg-accent-red", steps: 1 },
  fair: { label: "Fair", color: "bg-amber-500", steps: 2 },
  good: { label: "Good", color: "bg-yellow-400", steps: 3 },
  strong: { label: "Strong", color: "bg-emerald-500", steps: 4 },
} as const;

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const rules = checkPasswordRules(password);
  const strength = passwordStrength(password);
  const config = STRENGTH_CONFIG[strength];

  if (!password) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i < config.steps ? config.color : "bg-panel"}`}
            />
          ))}
        </div>
        <span className="text-[11px] font-semibold text-fg-muted shrink-0">{config.label}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-fg-subtle">
        <RuleItem met={rules.minLength} label="8+ characters" />
        <RuleItem met={rules.hasUppercase} label="Uppercase letter" />
        <RuleItem met={rules.hasLowercase} label="Lowercase letter" />
        <RuleItem met={rules.hasNumber} label="Number" />
        <RuleItem met={rules.hasSpecial} label="Special character" />
      </ul>
    </div>
  );
}

function RuleItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 transition-colors ${met ? "text-emerald-500" : "text-fg-subtle"}`}>
      <span className={`w-1 h-1 rounded-full shrink-0 ${met ? "bg-emerald-500" : "bg-fg-subtle"}`} />
      {label}
    </li>
  );
}
