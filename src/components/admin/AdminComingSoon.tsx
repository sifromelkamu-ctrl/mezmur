import type { LucideIcon } from "lucide-react";

interface AdminComingSoonProps {
  icon: LucideIcon;
  title: string;
  /** What exists today, if anything — never leave this implying nothing works when something partial already does. */
  today: string;
  /** What building the real page actually requires. */
  needed: string;
}

// For every sidebar destination that isn't a fully real page yet — shows
// exactly what already works today (even partially) and what's still
// needed, rather than a dead link or a screen that LOOKS interactive but
// does nothing when clicked. Both briefs for this admin site were explicit
// that unimplemented sections must not pretend to work.
export default function AdminComingSoon({ icon: Icon, title, today, needed }: AdminComingSoonProps) {
  return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
        style={{ background: "color-mix(in oklab, var(--color-brand) 14%, transparent)" }}
      >
        <Icon size={22} className="text-brand" />
      </div>
      <h2 className="text-lg font-semibold text-fg mb-1">{title}</h2>
      <p className="text-sm text-fg-muted mb-6">Not built as its own page yet.</p>
      <div className="text-left rounded-xl border border-border bg-panel p-4 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">Works today</p>
        <p className="text-sm text-fg">{today}</p>
      </div>
      <div className="text-left rounded-xl border border-border bg-panel p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">Needed for a dedicated page</p>
        <p className="text-sm text-fg">{needed}</p>
      </div>
    </div>
  );
}
