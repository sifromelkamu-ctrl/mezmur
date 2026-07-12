import type { TextareaHTMLAttributes } from "react";

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "panel" | "elevated";
}

// Theme-aware base for every <textarea> in the app — see TextField for why
// color/placeholder/caret/disabled aren't restated here.
export default function TextAreaField({ variant = "panel", className = "", ...props }: TextAreaFieldProps) {
  const bg = variant === "panel" ? "bg-panel" : "bg-elevated";
  return (
    <textarea
      className={`${bg} rounded-md focus:outline-none focus:ring-2 focus:ring-border disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}
