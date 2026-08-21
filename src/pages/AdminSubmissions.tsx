import { ChevronLeft, Loader2, Music2, ThumbsDown, ThumbsUp, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { adminSubmissionsApi, ApiError, type ApiSubmission } from "../lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusStyle(status: ApiSubmission["status"]) {
  if (status === "pending") return "bg-brand/10 ring-1 ring-brand/25";
  if (status === "approved") return "bg-elevated";
  return "bg-elevated opacity-70";
}

// Settings > Review Song Submissions — mirrors AdminContactMessages'
// structure (own admin-role gate, newest-first list, pending highlighted),
// but each entry can create real catalog rows on approve (see
// admin.ts's /submissions/:id/approve) rather than just being marked read.
export default function AdminSubmissions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApiSubmission | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ApiSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminSubmissionsApi
      .list()
      .then((r) => setSubmissions(r.submissions))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const approve = async (s: ApiSubmission) => {
    setBusyId(s.id);
    setError(null);
    try {
      const { submission } = await adminSubmissionsApi.approve(s.id);
      setSubmissions((prev) => prev.map((row) => (row.id === submission.id ? submission : row)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not approve this submission.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setError(null);
    try {
      const { submission } = await adminSubmissionsApi.reject(rejecting.id, rejectNote.trim() || undefined);
      setSubmissions((prev) => prev.map((row) => (row.id === submission.id ? submission : row)));
      setRejecting(null);
      setRejectNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject this submission.");
    } finally {
      setBusyId(null);
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await adminSubmissionsApi.remove(confirmDelete.id);
      setSubmissions((prev) => prev.filter((row) => row.id !== confirmDelete.id));
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="px-6 py-10 max-w-lg">
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

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
          <h1 className="text-2xl font-bold truncate">Song Submissions</h1>
          <p className="text-sm text-fg-muted mt-0.5">{pendingCount > 0 ? `${pendingCount} pending` : "All caught up"}</p>
        </div>
      </div>

      <p className="text-xs text-fg-muted mb-6 leading-relaxed">
        User uploads from Settings &gt; Upload Your Songs, newest first. Approving creates the real artist/album/track
        rows; rejecting just marks it and leaves the catalog untouched.
      </p>

      {error && <p className="text-sm text-accent-red mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-elevated py-16 px-6">
          <UploadCloud size={28} className="text-fg-subtle mb-3" />
          <p className="text-sm text-fg-muted">No submissions yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((s) => (
            <div key={s.id} className={`rounded-xl p-4 ${statusStyle(s.status)}`}>
              <div className="flex items-start gap-3 mb-3">
                {(s.type === "album" ? s.albumCoverUrl : s.tracks[0]?.artworkUrl) ? (
                  <img
                    src={(s.type === "album" ? s.albumCoverUrl : s.tracks[0]?.artworkUrl)!}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <span className="w-14 h-14 rounded-lg bg-elevated-hover flex items-center justify-center text-fg-subtle shrink-0">
                    <Music2 size={20} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {s.type === "album" ? s.albumTitle : s.tracks[0]?.title}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 truncate">
                    {s.artistName} · {s.profile?.email ?? "unknown"} · {formatDate(s.createdAt)}
                  </p>
                  <p className="text-xs text-fg-subtle mt-0.5 capitalize">
                    {s.type} · {s.tracks.length} song{s.tracks.length === 1 ? "" : "s"} · {s.status}
                    {s.reviewNote ? ` — ${s.reviewNote}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-3">
                {s.tracks.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-xs text-fg-subtle w-5 shrink-0 text-right">{i + 1}.</span>
                    <span className="text-xs truncate w-28 shrink-0">{t.title}</span>
                    <audio controls src={t.audioUrl} className="h-8 flex-1 min-w-0" />
                  </div>
                ))}
              </div>

              {s.status === "pending" && (
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    onClick={() => setRejecting(s)}
                    disabled={busyId === s.id}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-elevated-hover hover:bg-hover-strong transition-colors disabled:opacity-50"
                  >
                    <ThumbsDown size={13} /> Reject
                  </button>
                  <button
                    onClick={() => approve(s)}
                    disabled={busyId === s.id}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-brand text-black hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />} Approve
                  </button>
                </div>
              )}
              {s.status !== "pending" && (
                <div className="flex items-center justify-end pt-3 border-t border-border">
                  <button
                    onClick={() => setConfirmDelete(s)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors"
                    aria-label="Delete from history"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setRejecting(null)}>
          <div className="bg-elevated rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1.5">Reject this submission?</h3>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason (optional, shown to the submitter)"
              rows={3}
              className="w-full bg-panel rounded-md px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-border"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setRejecting(null)}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-elevated-hover hover:bg-hover-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={busyId === rejecting.id}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-accent-red text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-elevated rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1.5">Delete this from history?</h3>
            <p className="text-sm text-fg-muted mb-5">
              {confirmDelete.status === "approved"
                ? "The song(s) it created stay in the catalog — this only removes the submission record."
                : "This can't be undone."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-elevated-hover hover:bg-hover-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runDelete}
                disabled={busyId === confirmDelete.id}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-accent-red text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
