import { Check, ChevronLeft, Loader2, Mail, Paperclip, Plus, Send, X as XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextAreaField from "../components/form/TextAreaField";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { ApiError, contactApi, type ApiContactMessage } from "../lib/api";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChatEntry {
  id: string;
  sender: "user" | "admin";
  body: string;
  createdAt: string;
}

// Combines a thread's own first message and its replies into one uniformly
// shaped, chronological list — what the chat bubble view actually renders.
// The first message lives on ContactMessage itself rather than as a reply
// row (see schema.prisma), so this is what stitches the two back together.
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
}: {
  thread: ApiContactMessage;
  onBack: () => void;
  onUpdated: (t: ApiContactMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const entries = chatEntries(thread);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const { message } = await contactApi.reply(thread.id, body);
      onUpdated(message);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-6 pt-6 pb-32 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-lg font-bold truncate">{thread.subject}</h1>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((e) => (
          <div key={e.id} className={`flex ${e.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                e.sender === "user" ? "bg-brand text-black rounded-br-sm" : "bg-elevated text-fg rounded-bl-sm"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{e.body}</p>
              <p className={`text-[10px] mt-1 ${e.sender === "user" ? "text-black/60" : "text-fg-subtle"}`}>
                {formatTime(e.createdAt)}
              </p>
            </div>
          </div>
        ))}
        {thread.attachmentUrl && (
          <div className="flex justify-end">
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

      <div className="mt-4">
        {error && <p className="text-xs text-accent-red mb-2">{error}</p>}
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
            placeholder="Message"
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
    </div>
  );
}

function ComposeView({
  showBack,
  onBack,
  onSent,
}: {
  showBack: boolean;
  onBack: () => void;
  onSent: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentForGuest, setSentForGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim() && subject.trim() && message.trim() && !submitting;

  const handleAttachmentPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("That image is too large — please pick one under 5MB.");
      return;
    }
    setError(null);
    setAttachment(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await contactApi.submit({
        name: name.trim() || undefined,
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        attachment: attachment ?? undefined,
      });
      if (user) {
        onSent(id);
      } else {
        setSentForGuest(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => (showBack ? onBack() : navigate("/settings"));

  if (sentForGuest) {
    return (
      <div className="px-6 pt-6 pb-28 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={back}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
            aria-label="Back"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-2xl font-bold">Contact Us</h1>
        </div>
        <div className="bg-elevated rounded-lg p-4 flex flex-col items-center text-center gap-2 py-8">
          <span className="w-12 h-12 rounded-full bg-brand/15 flex items-center justify-center text-brand mb-1">
            <Check size={22} />
          </span>
          <p className="font-semibold">Message sent</p>
          <p className="text-sm text-fg-muted max-w-[32ch]">
            Thanks for reaching out — we'll get back to you at {email.trim()}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-28 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={back}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-2xl font-bold">Contact Us</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted -mt-2 mb-1">Have a question or found a problem? Write us below.</p>
        <TextField
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          variant="panel"
          className="px-4 py-2.5 text-base w-full"
        />
        <TextField
          type="email"
          required
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          variant="panel"
          className="px-4 py-2.5 text-base w-full"
        />
        <TextField
          type="text"
          required
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          variant="panel"
          className="px-4 py-2.5 text-base w-full"
        />
        <TextAreaField
          required
          placeholder="Your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          variant="panel"
          rows={6}
          className="px-4 py-2.5 text-base w-full resize-none"
        />
        {attachment ? (
          <div className="flex items-center gap-3 bg-panel rounded-md px-4 py-2.5">
            <Paperclip size={16} className="text-fg-muted shrink-0" />
            <span className="flex-1 text-sm truncate">{attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
              className="text-fg-muted hover:text-fg transition-colors shrink-0"
            >
              <XIcon size={16} />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm font-semibold text-brand hover:underline cursor-pointer w-fit">
            <Paperclip size={16} />
            Attach a screenshot
            <input type="file" accept="image/*" onChange={handleAttachmentPick} className="hidden" />
          </label>
        )}
        {error && <p className="text-sm text-accent-red">{error}</p>}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 bg-brand text-black font-bold rounded-full py-3.5 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:hover:scale-100"
        >
          {submitting ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}

type View = "list" | "thread" | "new";

export default function ContactUs() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [view, setView] = useState<View>("list");
  const [threads, setThreads] = useState<ApiContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadThreads = () => {
    if (!user) {
      setLoading(false);
      return;
    }
    contactApi
      .mine()
      .then((r) => setThreads(r.messages))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadThreads();
    // A guest has no conversations to list — the compose form is the only
    // thing there is for them to see.
    if (!user) setView("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const active = threads.find((t) => t.id === activeId) ?? null;

  if (view === "thread" && active) {
    return (
      <ThreadView
        thread={active}
        onBack={() => setView("list")}
        onUpdated={(updated) => setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
      />
    );
  }

  if (view === "new" || !user) {
    return (
      <ComposeView
        showBack={Boolean(user)}
        onBack={() => setView("list")}
        onSent={(id) => {
          loadThreads();
          setActiveId(id);
          setView("thread");
        }}
      />
    );
  }

  return (
    <div className="px-6 pt-6 pb-28 max-w-2xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
            aria-label="Back"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-2xl font-bold truncate">Contact Us</h1>
        </div>
        <button
          onClick={() => setView("new")}
          className="flex items-center gap-1.5 text-sm font-semibold bg-brand text-black rounded-full px-4 py-2 shrink-0"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-elevated py-16 px-6">
          <Mail size={28} className="text-fg-subtle mb-3" />
          <p className="text-sm text-fg-muted mb-4">No conversations yet.</p>
          <button onClick={() => setView("new")} className="text-sm font-semibold text-brand hover:underline">
            Write us
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => {
            const entries = chatEntries(t);
            const last = entries[entries.length - 1];
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveId(t.id);
                  setView("thread");
                }}
                className="w-full text-left bg-elevated rounded-xl p-4 hover:bg-elevated-hover transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm font-semibold truncate">{t.subject}</p>
                  <span className="text-xs text-fg-subtle shrink-0">{formatDay(last.createdAt)}</span>
                </div>
                <p className="text-xs text-fg-muted truncate">
                  {last.sender === "admin" ? "Mezmur: " : ""}
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
