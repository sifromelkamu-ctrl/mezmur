import type { SelectHTMLAttributes } from "react";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  variant?: "panel" | "elevated";
}

// Theme-aware base for every <select> in the app — the popup <option> list
// is themed globally in index.css (`select option { ... }`) since it can't
// take arbitrary Tailwind utilities reliably cross-browser.
export default function SelectField({ variant = "panel", className = "", children, ...props }: SelectFieldProps) {
  const bg = variant === "panel" ? "bg-panel" : "bg-elevated";
  return (
    <select
      className={`${bg} rounded-md focus:outline-none focus:ring-2 focus:ring-border disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
