import { ChevronLeft, Loader2, Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { adminApi, ApiError, type ApiUserAccess } from "../lib/api";

// Settings -> Free Access. The only way to comp an account today (see
// SubscriptionStatus.comped in schema.prisma) — there's no general
// user-management screen, this is purpose-built for one thing: find an
// account by email/username and flip its complimentary access on or off.
export default function AdminUserAccess() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiUserAccess[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      adminApi
        .searchUsers(q)
        .then((r) => {
          setResults(r.users);
          setSearched(true);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Search failed"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, isAdmin]);

  const toggleFreeAccess = async (target: ApiUserAccess) => {
    setBusyId(target.id);
    setError(null);
    try {
      const enabled = target.subscriptionStatus !== "comped";
      const { user: updated } = await adminApi.setFreeAccess(target.id, enabled);
      setResults((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
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
          <h1 className="text-2xl font-bold truncate">Free Access</h1>
          <p className="text-sm text-fg-muted mt-0.5">Grant an account complimentary access, no billing involved</p>
        </div>
      </div>

      <p className="text-xs text-fg-muted mb-6 leading-relaxed">
        Search by email or username to find an account, then grant or revoke free access. This never touches a real
        Stripe subscription — it's refused for any account that already has one.
      </p>

      <div className="relative mb-4">
        <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <TextField
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or username..."
          variant="panel"
          className="pl-9 pr-3 py-2.5 text-base w-full"
        />
      </div>

      {error && <p className="text-sm text-accent-red mb-3 px-1">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-fg-muted">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : searched && results.length === 0 ? (
        <p className="text-sm text-fg-muted px-2 py-8 text-center">No accounts found.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {results.map((u) => {
            const comped = u.subscriptionStatus === "comped";
            const hasRealSubscription = !comped && u.subscriptionStatus !== "none";
            return (
              <div key={u.id} className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-hover transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.name || u.email || u.phone || u.username}</p>
                  <p className="text-xs text-fg-muted truncate">
                    {u.email ?? u.phone ?? u.username} · {u.role}
                    {hasRealSubscription ? ` · ${u.subscriptionStatus}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleFreeAccess(u)}
                  disabled={busyId === u.id || hasRealSubscription}
                  className={`shrink-0 text-sm font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    comped ? "bg-elevated-hover hover:bg-hover-strong" : "bg-brand text-black hover:scale-105"
                  }`}
                >
                  {busyId === u.id ? "…" : comped ? "Revoke" : "Grant free access"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
