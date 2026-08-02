import { Check, ChevronLeft, ChevronRight, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import TextField from "./form/TextField";

const HISTORY_PAGE_SIZE = 10;

// Structurally compatible with both YoutubeCatalogBatchSummary and
// TelegramCatalogBatchSummary (see ../lib/api) — shared by both import
// pages' history lists. albumType is YouTube-only (its "Concert Album"
// destination choice); optional here so a Telegram batch, which has no
// concert concept, just never renders that badge below.
export interface ImportHistorySummary {
  id: string;
  sourceUrl: string;
  channelName: string | null;
  label: string | null;
  status: string;
  error: string | null;
  itemCount: number;
  albumType?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "completed_with_errors", label: "Completed with errors" },
  { value: "importing", label: "Importing" },
  { value: "stopped", label: "Stopped" },
  { value: "ready", label: "Ready to select" },
  { value: "error", label: "Failed" },
  { value: "enumerating", label: "Scanning" },
];

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  importing: "Importing…",
  stopped: "Stopped",
  ready: "Ready to select",
  error: "Failed",
  enumerating: "Scanning…",
};

const RETRYABLE_STATUSES = new Set(["error", "completed_with_errors"]);

function historyDuration(b: ImportHistorySummary): string {
  const ms = new Date(b.updatedAt).getTime() - new Date(b.createdAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

interface ImportHistoryPanelProps {
  history: ImportHistorySummary[];
  historyTotal: number;
  historyPage: number;
  setHistoryPage: (page: number) => void;
  historyQuery: string;
  setHistoryQuery: (q: string) => void;
  historyStatus: string;
  setHistoryStatus: (status: string) => void;
  selectedHistoryIds: Set<string>;
  toggleHistorySelected: (id: string) => void;
  openBatch: (batchId: string) => void;
  deleteHistoryEntry: (id: string) => void;
  deleteSelectedHistory: () => void;
  clearCompletedHistory: () => void;
  clearFailedHistory: () => void;
  clearAllHistory: () => void;
  retryHistoryEntry: (b: ImportHistorySummary) => void;
  renameHistoryEntry: (id: string, label: string | null) => void;
}

export default function ImportHistoryPanel({
  history,
  historyTotal,
  historyPage,
  setHistoryPage,
  historyQuery,
  setHistoryQuery,
  historyStatus,
  setHistoryStatus,
  selectedHistoryIds,
  toggleHistorySelected,
  openBatch,
  deleteHistoryEntry,
  deleteSelectedHistory,
  clearCompletedHistory,
  clearFailedHistory,
  clearAllHistory,
  retryHistoryEntry,
  renameHistoryEntry,
}: ImportHistoryPanelProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (historyTotal === 0 && !historyQuery && !historyStatus) return null;

  const totalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  const startRename = (b: ImportHistorySummary) => {
    setRenamingId(b.id);
    setRenameValue(b.label ?? b.channelName ?? "");
  };

  const confirmRename = (id: string) => {
    renameHistoryEntry(id, renameValue.trim() || null);
    setRenamingId(null);
  };

  return (
    <div className="bg-elevated rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs font-bold text-fg-muted uppercase tracking-wide">Import History</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={clearCompletedHistory}
            className="text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1 rounded-md hover:bg-elevated-hover transition-colors"
          >
            Clear Completed
          </button>
          <button
            onClick={clearFailedHistory}
            className="text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1 rounded-md hover:bg-elevated-hover transition-colors"
          >
            Clear Failed
          </button>
          <button
            onClick={clearAllHistory}
            className="text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1 rounded-md hover:bg-elevated-hover transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <TextField
            type="text"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="Search by channel or URL"
            variant="panel"
            className="w-full pl-8 pr-3 py-1.5 text-sm"
          />
        </div>
        <select
          value={historyStatus}
          onChange={(e) => setHistoryStatus(e.target.value)}
          className="bg-panel rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-border"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {selectedHistoryIds.size > 0 && (
          <button
            onClick={deleteSelectedHistory}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent-red hover:underline px-2 py-1.5"
          >
            <Trash2 size={13} />
            Delete Selected ({selectedHistoryIds.size})
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-fg-muted px-1 py-2">No import history matches your search.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {history.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-elevated-hover transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedHistoryIds.has(b.id)}
                onChange={() => toggleHistorySelected(b.id)}
                className="shrink-0"
              />
              <button onClick={() => openBatch(b.id)} className="min-w-0 flex-1 text-left">
                {renamingId === b.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <TextField
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmRename(b.id)}
                      variant="panel"
                      className="text-sm px-2 py-1 flex-1"
                    />
                    <button onClick={() => confirmRename(b.id)} className="text-brand shrink-0" aria-label="Save name">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setRenamingId(null)} className="text-fg-muted shrink-0" aria-label="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold truncate">{b.label ?? b.channelName ?? b.sourceUrl}</p>
                )}
                <p className="text-xs text-fg-muted">
                  {b.albumType === "live" && <span className="text-brand font-semibold">Concert · </span>}
                  {b.itemCount} songs found · {STATUS_LABEL[b.status] ?? b.status} · {historyDuration(b)} ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </p>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {renamingId !== b.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(b);
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
                    aria-label="Rename"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {RETRYABLE_STATUSES.has(b.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryHistoryEntry(b);
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
                    aria-label="Retry import"
                  >
                    <RefreshCw size={13} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteHistoryEntry(b.id);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-hover transition-colors"
                  aria-label="Remove this history entry"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
            disabled={historyPage <= 1}
            className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-fg-muted">
            Page {historyPage} of {totalPages}
          </span>
          <button
            onClick={() => setHistoryPage(Math.min(totalPages, historyPage + 1))}
            disabled={historyPage >= totalPages}
            className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
