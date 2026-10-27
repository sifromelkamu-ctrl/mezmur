import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type AuditLogEntry } from "../../lib/api";

function formatMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return Object.entries(metadata)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getAuditLog(100)
      .then(({ entries }) => setEntries(entries))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the audit log"));
  }, []);

  return (
    <AdminLayout title="Audit Log">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-fg-muted mb-5">
          The last 100 admin actions, newest first — catalog edits, imports, moderation, and user-access changes.
        </p>

        {error && <p className="text-sm text-accent-red mb-4">{error}</p>}

        {entries === null && !error ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : entries && entries.length === 0 ? (
          <p className="text-sm text-fg-subtle">No admin actions recorded yet.</p>
        ) : (
          <div className="rounded-2xl border border-border bg-panel divide-y divide-border overflow-hidden">
            {entries?.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-fg">
                    <span className="font-semibold">{e.adminName}</span>{" "}
                    <span className="text-fg-muted">{e.action}</span>
                  </p>
                  <span className="text-xs text-fg-subtle shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                {formatMetadata(e.metadata) && (
                  <p className="text-xs text-fg-subtle mt-1 truncate">{formatMetadata(e.metadata)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
