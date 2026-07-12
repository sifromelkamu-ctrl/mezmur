import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: "panel" | "elevated";
  pill?: boolean;
}

// Theme-aware base for every text/email/password/search input in the app —
// text/placeholder/caret/disabled/autofill colors come from the global rules
// in index.css, so this only needs to own background/rounding/focus.
export default function TextField({ variant = "elevated", pill = false, className = "", ...props }: TextFieldProps) {
  const bg = variant === "panel" ? "bg-panel" : "bg-elevated";
  const rounding = pill ? "rounded-full" : "rounded-md";
  return (
    <input
      className={`${bg} ${rounding} focus:outline-none focus:ring-2 focus:ring-border disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}
