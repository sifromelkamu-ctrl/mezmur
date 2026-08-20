import { ChevronLeft, Loader2, Mail, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { adminContactApi, type ApiContactMessage } from "../lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Settings -> Contact Us submissions (see routes/contact.ts for the public
// submit endpoint this reads). No search/filtering — a "write us" inbox
// isn't expected to reach a volume where that matters.
export default function AdminContactMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [messages, setMessages] = useState<ApiContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiContactMessage | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminContactApi
      .list()
      .then((r) => setMessages(r.messages))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const toggleRead = async (msg: ApiContactMessage) => {
    setBusyId(msg.id);
    try {
      const nextStatus = msg.status === "new" ? "read" : "new";
      const { message } = await adminContactApi.setStatus(msg.id, nextStatus);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    } finally {
      setBusyId(null);
    }
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await adminContactApi.remove(confirmDelete.id);
      setMessages((prev) => prev.filter((m) => m.id !== confirmDelete.id));
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

  const newCount = messages.filter((m) => m.status === "new").length;

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
          <h1 className="text-2xl font-bold truncate">Contact Messages</h1>
          <p className="text-sm text-fg-muted mt-0.5">
            {newCount > 0 ? `${newCount} unread` : "All caught up"}
          </p>
        </div>
      </div>

      <p className="text-xs text-fg-muted mb-6 leading-relaxed">
        Submissions from Settings &gt; Contact Us, newest first. Tap a message to mark it read; tap it again to mark
        it unread.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-elevated py-16 px-6">
          <Mail size={28} className="text-fg-subtle mb-3" />
          <p className="text-sm text-fg-muted">No messages yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl p-4 transition-colors ${
                msg.status === "new" ? "bg-brand/10 ring-1 ring-brand/25" : "bg-elevated"
              }`}
            >
              <button onClick={() => toggleRead(msg)} disabled={busyId === msg.id} className="w-full text-left">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="text-sm font-semibold truncate">{msg.subject}</p>
                  <span className="text-xs text-fg-subtle shrink-0">{formatDate(msg.createdAt)}</span>
                </div>
                <p className="text-xs text-fg-muted mb-2">
                  {msg.name ? `${msg.name} · ` : ""}
                  {msg.email}
                  {msg.userId ? " · has an account" : ""}
                </p>
                <p className="text-sm text-fg whitespace-pre-wrap">{msg.message}</p>
              </button>
              <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
                <a
                  href={`mailto:${msg.email}?subject=${encodeURIComponent(`Re: ${msg.subject}`)}`}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Reply by email
                </a>
                <button
                  onClick={() => setConfirmDelete(msg)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors"
                  aria-label={`Delete message from ${msg.email}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div
            className="bg-elevated rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-1.5">Delete this message?</h3>
            <p className="text-sm text-fg-muted mb-5">This can't be undone.</p>
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
