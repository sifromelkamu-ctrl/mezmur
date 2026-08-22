import { ChevronLeft, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface ChatEntry {
  id: string;
  sender: "user" | "admin";
  body: string;
  createdAt: string;
}

// Same stitching as ContactUs.tsx's chatEntries — the thread's own first
// message plus every reply, as one chronological list.
function chatEntries(thread: ApiContactMessage): ChatEntry[] {
  return [
    { id: thread.id, sender: "user" as const, body: thread.message, createdAt: thread.createdAt },
    ...thread.replies.map((r) => ({ id: r.id, sender: r.sender, body: r.body, createdAt: r.createdAt })),
  ];
}

function ThreadView({
  thread,
  onBack,
  onUpdated,
  onDelete,
}: {
  thread: ApiContactMessage;
  onBack: () => void;
  onUpdated: (t: ApiContactMessage) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const entries = chatEntries(thread);
  const markedRead = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  // Opening a conversation marks it read, same as any chat app — no manual
  // toggle needed the way the old single-reply inbox required.
  useEffect(() => {
    if (thread.status === "new" && !markedRead.current) {
      markedRead.current = true;
      adminContactApi.setStatus(thread.id, "read").then(({ message }) => onUpdated(message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { message } = await adminContactApi.reply(thread.id, body);
      onUpdated(message);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-6 pt-6 pb-32 max-w-2xl">
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{thread.subject}</h1>
          <p className="text-xs text-fg-muted truncate">
            {thread.name ? `${thread.name} · ` : ""}
            {thread.email}
            {thread.userId ? " · has an account" : " · guest"}
          </p>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors shrink-0"
          aria-label="Delete conversation"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className={`flex ${e.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                e.sender === "admin" ? "bg-brand text-black rounded-br-sm" : "bg-elevated text-fg rounded-bl-sm"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{e.body}</p>
              <p className={`text-[10px] mt-1 ${e.sender === "admin" ? "text-black/60" : "text-fg-subtle"}`}>
                {formatTime(e.createdAt)}
              </p>
            </div>
          </div>
        ))}
        {thread.attachmentUrl && (
          <div className="flex justify-start">
            <a
              href={thread.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl overflow-hidden ring-1 ring-border w-32 h-32 shrink-0"
            >
              <img src={thread.attachmentUrl} alt="Attachment" className="w-full h-full object-cover" />
            </a>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!thread.userId && (
          <p className="text-xs text-fg-subtle">
            No account —{" "}
            <a
              href={`mailto:${thread.email}?subject=${encodeURIComponent(`Re: ${thread.subject}`)}`}
              className="font-semibold text-brand hover:underline"
            >
              reply by email
            </a>{" "}
            instead; a reply here won't reach them.
          </p>
        )}
        <div className="flex items-center gap-2 bg-elevated rounded-full pl-4 pr-1.5 py-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Reply"
            className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className="w-9 h-9 rounded-full bg-brand text-black flex items-center justify-center disabled:opacity-50 shrink-0"
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div className="bg-elevated rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1.5">Delete this conversation?</h3>
            <p className="text-sm text-fg-muted mb-5">This can't be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-elevated-hover hover:bg-hover-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-accent-red text-white hover:opacity-90 transition-opacity"
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

// Settings -> Contact Us submissions (see routes/contact.ts for the public
// submit endpoint this reads). No search/filtering — a "write us" inbox
// isn't expected to reach a volume where that matters.
export default function AdminContactMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [messages, setMessages] = useState<ApiContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    adminContactApi
      .list()
      .then((r) => setMessages(r.messages))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const runDelete = async (id: string) => {
    setBusyId(id);
    try {
      await adminContactApi.remove(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setActiveId(null);
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

  const active = messages.find((m) => m.id === activeId) ?? null;
  if (active) {
    return (
      <ThreadView
        thread={active}
        onBack={() => setActiveId(null)}
        onUpdated={(updated) => setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
        onDelete={() => runDelete(active.id)}
      />
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
          <p className="text-sm text-fg-muted mt-0.5">{newCount > 0 ? `${newCount} unread` : "All caught up"}</p>
        </div>
      </div>

      <p className="text-xs text-fg-muted mb-6 leading-relaxed">
        Conversations from Settings &gt; Contact Us, newest first. Tap one to open it — replying there notifies the
        sender in-app when they have an account.
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
          {messages.map((msg) => {
            const entries = chatEntries(msg);
            const last = entries[entries.length - 1];
            return (
              <button
                key={msg.id}
                onClick={() => setActiveId(msg.id)}
                disabled={busyId === msg.id}
                className={`w-full text-left rounded-xl p-4 transition-colors ${
                  msg.status === "new" ? "bg-brand/10 ring-1 ring-brand/25" : "bg-elevated hover:bg-elevated-hover"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm font-semibold truncate">{msg.subject}</p>
                  <span className="text-xs text-fg-subtle shrink-0">{formatDate(last.createdAt)}</span>
                </div>
                <p className="text-xs text-fg-muted mb-1 truncate">
                  {msg.name ? `${msg.name} · ` : ""}
                  {msg.email}
                </p>
                <p className="text-xs text-fg-subtle truncate">
                  {last.sender === "admin" ? "You: " : ""}
                  {last.body}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
