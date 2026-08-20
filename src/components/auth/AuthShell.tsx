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
    // Fixed to the viewport (h-dvh, not min-h-screen) with overflow-hidden
    // so the whole flow is always one non-scrolling screen — every step's
    // own spacing is kept compact enough to fit within it.
    <div className="h-dvh w-full flex flex-col bg-base overflow-hidden relative">
      {/* Same ambient glow as the main app's chrome (Home/Library/etc via
          AppShell) — reused here rather than invented fresh, so the auth
          flow reads as the same premium surface instead of a plainer
          bolt-on screen. Falls back to the brand/cyan default pairing
          (--color-ambient-1/2's own :root default) since no track is
          playing yet at this point in the app. */}
      <div className="aurora-bg" />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-1 shrink-0">
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

        <div key={stepKey} className="flex-1 min-h-0 flex flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] auth-step">
          <div className="max-w-sm w-full mx-auto flex-1 min-h-0 flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight mb-1">{title}</h1>
            {subtitle && <p className="text-sm text-fg-muted mb-4">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
