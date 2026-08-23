import { AlertCircle, ChevronLeft, FlaskConical, Loader2, RefreshCw, Search, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { adminMediaMigrationApi, type ApiMediaMigrationJob, type ApiMediaMigrationStatus } from "../lib/api";

const POLL_INTERVAL_MS = 2000;

const MEDIA_KIND_LABEL: Record<string, string> = {
  track_audio: "Song audio",
  track_cover: "Single artwork",
  album_cover: "Album art",
  artist_photo: "Artist photo",
  playlist_cover: "Playlist cover",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "brand" | "red" | "muted" }) {
  const color = tone === "brand" ? "text-brand" : tone === "red" ? "text-accent-red" : "text-fg";
  return (
    <div className="bg-elevated rounded-lg p-3.5">
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-fg-muted mt-0.5">{label}</p>
    </div>
  );
}

// Settings > Admin > Media Migration — Supabase Storage -> Cloudflare R2.
// No CLI needed: discover, run a small test, watch a batch progress live
// (bytes + speed, not just a file count), retry failures, all from here.
// Nothing here ever touches or deletes a Supabase original — see
// server/src/storage/migration.ts for the full safety reasoning.
export default function AdminMediaMigration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [status, setStatus] = useState<ApiMediaMigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [batchSize, setBatchSize] = useState("50");
  const [failedJobs, setFailedJobs] = useState<ApiMediaMigrationJob[]>([]);
  const [showFailed, setShowFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadStatus = () => adminMediaMigrationApi.status().then(setStatus);

  useEffect(() => {
    if (!isAdmin) return;
    loadStatus().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Polls only while a batch is actually running, so the page is quiet the
  // rest of the time — same pattern as YoutubeCatalogImport's own progress
  // polling.
  useEffect(() => {
    if (status?.progress.running) {
      pollRef.current = window.setInterval(loadStatus, POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.progress.running]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const loadFailed = async () => {
    setShowFailed((s) => !s);
    if (!showFailed) {
      const { jobs } = await adminMediaMigrationApi.jobs("failed");
      setFailedJobs(jobs);
    }
  };

  if (!isAdmin) {
    return (
      <div className="px-6 py-10 max-w-lg">
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const byStatus = status?.byStatus ?? {};
  const done = (byStatus.verified ?? 0) + (byStatus.completed ?? 0) + (byStatus.skipped ?? 0);
  const total = status?.total ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasPassedTest = (byStatus.verified ?? 0) > 0;
  const running = status?.progress.running ?? false;

  let speedLabel: string | null = null;
  if (running && status?.progress.batchStartedAt) {
    const elapsedSec = (Date.now() - new Date(status.progress.batchStartedAt).getTime()) / 1000;
    if (elapsedSec > 1 && status.progress.bytesTransferredInBatch > 0) {
      speedLabel = `${formatBytes(status.progress.bytesTransferredInBatch / elapsedSec)}/s`;
    }
  }

  return (
    <div className="px-6 py-6 max-w-2xl pb-24">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate("/settings")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Media Migration</h1>
          <p className="text-sm text-fg-muted mt-0.5">Supabase Storage → Cloudflare R2 · server-to-server</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <>
          {!status?.r2Configured && (
            <div className="bg-elevated rounded-lg p-4 flex items-start gap-3 mb-6 text-sm text-fg-muted">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-accent-red" />
              <p>
                R2 isn't configured yet — new uploads and migration are both disabled until the R2_* environment
                variables are set on the server. You can still scan to see what would be migrated.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard label="Total tracked" value={total} />
            <StatCard label="Migrated" value={done} tone="brand" />
            <StatCard label="Pending" value={byStatus.pending ?? 0} />
            <StatCard label="Failed" value={byStatus.failed ?? 0} tone="red" />
          </div>

          {total > 0 && (
            <div className="mb-4">
              <div className="h-2 rounded-full bg-elevated overflow-hidden">
                <div className="h-full bg-brand transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-fg-muted mt-1.5">
                {percent}% migrated
                {status?.estimatedTotalBytes != null && (
                  <> · {formatBytes(status.bytesMigratedSoFar)} of ~{formatBytes(status.estimatedTotalBytes)} (estimated)</>
                )}
              </p>
            </div>
          )}

          {running && (
            <div className="bg-brand/10 ring-1 ring-brand/25 rounded-lg p-3.5 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 size={18} className="animate-spin text-brand shrink-0" />
                <p className="text-sm">
                  Batch running — {status!.progress.processedInBatch} / {status!.progress.currentBatchSize} done. Keeps
                  running on the server even if you close this page.
                </p>
              </div>
              <p className="text-xs text-fg-muted">
                {formatBytes(status!.progress.bytesTransferredInBatch)} transferred{speedLabel ? ` · ${speedLabel}` : ""}
              </p>
              {status!.progress.inFlight.length > 0 && (
                <p className="text-xs text-fg-subtle mt-1 truncate">
                  Now transferring:{" "}
                  {status!.progress.inFlight
                    .map((f) => `${MEDIA_KIND_LABEL[f.mediaKind] ?? f.mediaKind} (${f.entityId.slice(0, 8)}…)`)
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-accent-red mb-4">{error}</p>}

          <div className="flex flex-col gap-3 mb-6">
            <button
              onClick={() => runAction(() => adminMediaMigrationApi.discover())}
              disabled={busy || running}
              className="flex items-center justify-center gap-2 bg-elevated hover:bg-elevated-hover rounded-full py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Search size={16} /> Scan for media to migrate
            </button>

            {!hasPassedTest ? (
              <button
                onClick={() => runAction(() => adminMediaMigrationApi.test())}
                disabled={busy || running || !status?.r2Configured || (byStatus.pending ?? 0) === 0}
                className="flex items-center justify-center gap-2 bg-brand text-black rounded-full py-3 text-sm font-semibold disabled:opacity-50"
              >
                <FlaskConical size={16} /> Run test (1 file)
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-elevated rounded-lg p-2.5">
                <TextField
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  placeholder="Batch size"
                  variant="panel"
                  className="w-24 px-3 py-2 text-sm shrink-0"
                />
                <button
                  onClick={() => runAction(() => adminMediaMigrationApi.run(Number(batchSize) || undefined))}
                  disabled={busy || running || !status?.r2Configured || (byStatus.pending ?? 0) === 0}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand text-black rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  <UploadCloud size={16} /> Migrate next batch
                </button>
              </div>
            )}
            {!hasPassedTest && (byStatus.pending ?? 0) > 0 && (
              <p className="text-xs text-fg-subtle -mt-1.5">
                A test file has to succeed before a larger batch is allowed — this migrates exactly one, then unlocks
                normal batches.
              </p>
            )}

            {(byStatus.failed ?? 0) > 0 && (
              <button
                onClick={() => runAction(() => adminMediaMigrationApi.retryFailed())}
                disabled={busy || running}
                className="flex items-center justify-center gap-2 bg-elevated hover:bg-elevated-hover rounded-full py-3 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} /> Retry {byStatus.failed} failed file{byStatus.failed === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {(byStatus.failed ?? 0) > 0 && (
            <div>
              <button onClick={loadFailed} className="text-sm font-semibold text-brand hover:underline mb-3">
                {showFailed ? "Hide" : "Show"} failed files
              </button>
              {showFailed && (
                <div className="flex flex-col gap-2">
                  {failedJobs.map((j) => (
                    <div key={j.id} className="bg-elevated rounded-lg p-3">
                      <p className="text-xs font-semibold">
                        {MEDIA_KIND_LABEL[j.mediaKind] ?? j.mediaKind} · {j.entityId}
                      </p>
                      <p className="text-xs text-accent-red mt-1">{j.errorMessage}</p>
                      <p className="text-xs text-fg-subtle mt-1">Retried {j.retryCount} time{j.retryCount === 1 ? "" : "s"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
