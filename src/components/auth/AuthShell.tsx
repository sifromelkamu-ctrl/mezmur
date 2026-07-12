import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  // Keys the step-transition animation so switching steps (e.g. entry ->
  // email sign-up -> verify) always re-triggers the slide/fade instead of
  // only animating on first mount.
  stepKey: string;
}

// Shared full-screen frame for every auth step — consistent premium chrome
// (back button, title, generous spacing) so the whole flow reads as one
// continuous, elegant surface rather than a patchwork of separate screens.
export default function AuthShell({ title, subtitle, onBack, children, stepKey }: AuthShellProps) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-base">
      <div className="flex items-center px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-2 shrink-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
            aria-label="Back"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      <div key={stepKey} className="flex-1 flex flex-col px-6 pb-10 auth-step">
        <div className="max-w-sm w-full mx-auto flex-1 flex flex-col">
          <h1 className="text-2xl font-bold mb-1.5">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted mb-6">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
