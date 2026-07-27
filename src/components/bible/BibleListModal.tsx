import { ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface BibleListModalRow {
  key: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClick: () => void;
}

// Shared bottom-sheet list for the Bible home screen's Bookmarks/Notes/
// Favorites/"view all" History quick-access buttons — same row shape,
// different data source, so one component covers all four instead of
// four near-identical ones. Portaled to document.body like every other
// modal in this app: App.tsx wraps all routes in a `relative z-10` div,
// which — despite the modal itself being position:fixed — creates its own
// stacking context, so a naive z-50 nested inside it still paints *below*
// the bottom nav's `fixed z-30` sibling instead of above it. Since portaling
// escapes the themed .bible-scope ancestor too, "bible-scope" is re-applied
// directly on the sheet so its color tokens still resolve correctly.
export default function BibleListModal({
  title,
  emptyLabel,
  rows,
  onClose,
}: {
  title: string;
  emptyLabel: string;
  rows: BibleListModalRow[];
  onClose: () => void;
}) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="bible-scope fixed inset-x-0 bottom-0 z-50 bg-elevated rounded-t-3xl max-h-[75vh] overflow-y-auto overscroll-y-contain p-5 pb-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-agbalumo text-xl font-bold text-gold">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted py-10 text-center">{emptyLabel}</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <button
                key={r.key}
                onClick={r.onClick}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-hover text-left transition-colors"
              >
                {r.badge}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg truncate">{r.title}</p>
                  {r.subtitle && <p className="text-xs text-fg-muted truncate mt-0.5">{r.subtitle}</p>}
                </div>
                <ChevronRight size={16} className="text-fg-subtle shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
