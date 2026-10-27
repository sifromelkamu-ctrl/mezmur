import {
  AlertTriangle,
  Clock,
  Disc3,
  Flame,
  ListMusic,
  Plus,
  Ticket,
  TrendingUp,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { useAuth } from "../../context/useAuth";
import {
  adminApi,
  adminSubmissionsApi,
  albumsApi,
  artistsApi,
  tracksApi,
  type ApiAlbum,
  type ApiTrack,
  type AuditLogEntry,
} from "../../lib/api";

// null = couldn't be loaded (endpoint errored, or the metric just isn't
// wired yet) — rendered as "—", never silently treated as 0. A real zero
// and "we don't know" must never look the same here.
interface Stats {
  songs: number | null;
  artists: number | null;
  albums: number | null;
  concerts: number | null;
  users: number | null;
  pendingReviews: number | null;
  failedImports: number | null;
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in oklab, var(--color-brand) 14%, transparent)" }}
        >
          <Icon size={15} className="text-brand" />
        </span>
      </div>
      <p className="text-2xl font-semibold text-fg tabular-nums">{value === null ? "—" : value.toLocaleString()}</p>
      <p className="text-xs text-fg-muted mt-0.5">{label}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    songs: null,
    artists: null,
    albums: null,
    concerts: null,
    users: null,
    pendingReviews: null,
    failedImports: null,
  });
  const [recentReleases, setRecentReleases] = useState<ApiAlbum[] | null>(null);
  const [popularSongs, setPopularSongs] = useState<ApiTrack[] | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    // Each piece is independent — one endpoint erroring (e.g. Telegram import
    // isn't configured, see README) must not blank out the rest of a
    // dashboard that otherwise loaded fine.
    tracksApi
      .list()
      .then((tracks) => {
        setStats((s) => ({ ...s, songs: tracks.length }));
        setPopularSongs([...tracks].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, 5));
      })
      .catch(() => {});

    artistsApi
      .list()
      .then((artists) => setStats((s) => ({ ...s, artists: artists.length })))
      .catch(() => {});

    albumsApi
      .list()
      .then((albums) => {
        const concerts = albums.filter((a) => a.albumType === "live").length;
        setStats((s) => ({ ...s, albums: albums.length - concerts, concerts }));
        setRecentReleases(
          [...albums]
            .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
            .slice(0, 5)
        );
      })
      .catch(() => {});

    adminApi
      .getUserCount()
      .then(({ count }) => setStats((s) => ({ ...s, users: count })))
      .catch(() => {});

    adminSubmissionsApi
      .list("pending")
      .then(({ submissions }) => setStats((s) => ({ ...s, pendingReviews: submissions.length })))
      .catch(() => {});

    Promise.allSettled([
      adminApi.listYoutubeCatalogBatches({ status: "failed" }),
      adminApi.listTelegramCatalogBatches({ status: "failed" }),
    ]).then(([yt, tg]) => {
      const ytCount = yt.status === "fulfilled" ? yt.value.batches.length : null;
      const tgCount = tg.status === "fulfilled" ? tg.value.batches.length : null;
      if (ytCount === null && tgCount === null) return; // both unavailable — leave as "—"
      setStats((s) => ({ ...s, failedImports: (ytCount ?? 0) + (tgCount ?? 0) }));
    });

    adminApi
      .getAuditLog(8)
      .then(({ entries }) => setActivity(entries))
      .catch(() => {});
  }, []);

  return (
    <AdminLayout title="Overview">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-fg">Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h2>
            <p className="text-sm text-fg-muted mt-0.5">Here's what's happening across Mezmur.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/upload"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-white"
              style={{ background: "var(--color-brand)" }}
            >
              <Plus size={14} />
              Add song
            </Link>
            <Link
              to="/admin/youtube-catalog-import"
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-fg hover:bg-hover transition-colors"
            >
              <Upload size={14} />
              Import music
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatTile icon={ListMusic} label="Songs" value={stats.songs} />
          <StatTile icon={Users} label="Artists" value={stats.artists} />
          <StatTile icon={Disc3} label="Albums" value={stats.albums} />
          <StatTile icon={Ticket} label="Concerts" value={stats.concerts} />
          <StatTile icon={Users} label="Registered users" value={stats.users} />
          <StatTile icon={Clock} label="Pending reviews" value={stats.pendingReviews} />
          <StatTile icon={AlertTriangle} label="Failed imports" value={stats.failedImports} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp size={14} className="text-brand" />
              <h3 className="text-sm font-semibold text-fg">Recently published</h3>
            </div>
            {recentReleases === null ? (
              <p className="text-xs text-fg-subtle">Loading…</p>
            ) : recentReleases.length === 0 ? (
              <p className="text-xs text-fg-subtle">Nothing published yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {recentReleases.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-md shrink-0 bg-cover bg-center"
                      style={{
                        backgroundImage: a.coverUrl ? `url(${a.coverUrl})` : undefined,
                        background: a.coverUrl ? undefined : `linear-gradient(135deg, ${a.gradient[0]}, ${a.gradient[1]})`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-fg truncate">{a.title}</p>
                      <p className="text-[11px] text-fg-subtle truncate">{a.artistName ?? "Unknown artist"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Flame size={14} className="text-brand" />
              <h3 className="text-sm font-semibold text-fg">Popular songs</h3>
            </div>
            {popularSongs === null ? (
              <p className="text-xs text-fg-subtle">Loading…</p>
            ) : popularSongs.every((t) => !t.playCount) ? (
              <p className="text-xs text-fg-subtle">No play data yet.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {popularSongs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2.5 min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-fg truncate">{t.title}</p>
                      <p className="text-[11px] text-fg-subtle truncate">{t.artistName ?? "Unknown artist"}</p>
                    </div>
                    <span className="text-[11px] text-fg-subtle tabular-nums shrink-0">{(t.playCount ?? 0).toLocaleString()} plays</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-4">
          <h3 className="text-sm font-semibold text-fg mb-3">Recent administrative activity</h3>
          {activity === null ? (
            <p className="text-xs text-fg-subtle">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-fg-subtle">No recent activity.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {activity.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <p className="text-xs text-fg truncate">
                    <span className="font-medium">{e.adminName}</span> <span className="text-fg-muted">{e.action}</span>
                  </p>
                  <span className="text-[11px] text-fg-subtle shrink-0">{timeAgo(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
