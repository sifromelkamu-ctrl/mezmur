import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminLibraryApi, artistsApi, tracksApi, type ApiArtist, type ApiTrack } from "../../lib/api";
import { formatDuration } from "../../utils/format";

type ReleaseType = "all" | "album" | "single" | "concert";
type SortKey = "title" | "artist" | "duration" | "plays";

function releaseTypeOf(track: ApiTrack): Exclude<ReleaseType, "all"> {
  if (track.isConcertSong) return "concert";
  if (track.isSingle) return "single";
  return "album";
}

const RELEASE_TYPE_LABEL: Record<Exclude<ReleaseType, "all">, string> = {
  album: "Album track",
  single: "Single",
  concert: "Concert song",
};

const PAGE_SIZE = 25;

interface EnrichedTrack extends ApiTrack {
  releaseType: Exclude<ReleaseType, "all">;
}

export default function AdminMusicCatalog() {
  const [tracks, setTracks] = useState<ApiTrack[] | null>(null);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReleaseType>("all");
  const [artistFilter, setArtistFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ApiTrack | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = () => {
    setError(null);
    Promise.all([adminLibraryApi.listAllTracks(), artistsApi.list()])
      .then(([t, ar]) => {
        setTracks(t);
        setArtists(ar);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the catalog"));
  };

  useEffect(() => {
    load();
    const audio = new Audio();
    audio.addEventListener("ended", () => setPreviewingId(null));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const enriched: EnrichedTrack[] = useMemo(() => {
    if (!tracks) return [];
    return tracks.map((t) => ({ ...t, releaseType: releaseTypeOf(t) }));
  }, [tracks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = enriched;
    if (typeFilter !== "all") rows = rows.filter((t) => t.releaseType === typeFilter);
    if (artistFilter) rows = rows.filter((t) => t.artistId === artistFilter);
    if (q) {
      rows = rows.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.artistName ?? "").toLowerCase().includes(q) ||
          (t.albumTitle ?? "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "artist":
          return (a.artistName ?? "").localeCompare(b.artistName ?? "") * dir;
        case "duration":
          return (a.duration - b.duration) * dir;
        case "plays":
          return ((a.playCount ?? 0) - (b.playCount ?? 0)) * dir;
      }
    });
  }, [enriched, query, typeFilter, artistFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, typeFilter, artistFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const pageIds = pageRows.map((t) => t.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const togglePreview = async (track: ApiTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewingId === track.id) {
      audio.pause();
      setPreviewingId(null);
      return;
    }
    if (!track.hasAudio) return;
    setPreviewLoadingId(track.id);
    try {
      const { url } = await tracksApi.getStreamUrl(track.id);
      audio.src = url;
      await audio.play();
      setPreviewingId(track.id);
    } catch {
      setPreviewingId(null);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const runDelete = async (track: ApiTrack) => {
    setDeletingId(track.id);
    try {
      await adminLibraryApi.deleteTrack(track.id);
      setTracks((prev) => prev?.filter((t) => t.id !== track.id) ?? null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const runBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => adminLibraryApi.deleteTrack(id)));
    const failed = ids.filter((_, i) => results[i].status === "rejected");
    setTracks((prev) => prev?.filter((t) => !ids.includes(t.id) || failed.includes(t.id)) ?? null);
    setSelected(new Set(failed));
    if (failed.length > 0) setError(`${failed.length} of ${ids.length} song(s) couldn't be deleted.`);
    setBulkDeleting(false);
  };

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <button
      onClick={() => toggleSort(sortBy)}
      className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle hover:text-fg transition-colors"
    >
      {label}
      {sortKey === sortBy && (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  return (
    <AdminLayout title="Music Catalog">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">Music Catalog</h2>
            <p className="text-xs text-fg-muted mt-0.5">{tracks === null ? "Loading…" : `${filtered.length} of ${tracks.length} songs`}</p>
          </div>
          <Link
            to="/admin/upload"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-white"
            style={{ background: "var(--color-brand)" }}
          >
            <Plus size={14} />
            Add song
          </Link>
        </div>

        {error && <p className="text-sm text-accent-red mb-4">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, artist, or album…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-panel text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "album", "single", "concert"] as ReleaseType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  typeFilter === t ? "bg-brand/12 border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
                }`}
              >
                {t === "all" ? "All" : t === "album" ? "Album tracks" : t === "single" ? "Singles" : "Concert songs"}
              </button>
            ))}
          </div>
          <select
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-border bg-panel text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="">All artists</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-lg bg-brand/10 border border-brand/30">
            <p className="text-xs font-semibold text-fg">{selected.size} selected</p>
            <button
              onClick={runBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 text-xs font-semibold text-accent-red hover:brightness-110 disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete selected
            </button>
          </div>
        )}

        {tracks === null ? (
          <div className="flex items-center justify-center py-20 text-fg-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-10 pl-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={pageRows.length > 0 && pageRows.every((t) => selected.has(t.id))}
                        onChange={toggleSelectPage}
                        className="rounded"
                      />
                    </th>
                    <th className="w-10"></th>
                    <th className="text-left py-2.5 pr-3"><SortHeader label="Title" sortBy="title" /></th>
                    <th className="text-left py-2.5 pr-3 hidden md:table-cell"><SortHeader label="Artist" sortBy="artist" /></th>
                    <th className="text-left py-2.5 pr-3 hidden lg:table-cell text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Album</th>
                    <th className="text-left py-2.5 pr-3 hidden sm:table-cell text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Type</th>
                    <th className="text-right py-2.5 pr-3"><SortHeader label="Duration" sortBy="duration" /></th>
                    <th className="text-right py-2.5 pr-3 hidden sm:table-cell"><SortHeader label="Plays" sortBy="plays" /></th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-hover transition-colors">
                      <td className="pl-3">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} className="rounded" />
                      </td>
                      <td>
                        <button
                          onClick={() => togglePreview(t)}
                          disabled={!t.hasAudio || previewLoadingId === t.id}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label={previewingId === t.id ? "Pause preview" : "Preview"}
                        >
                          {previewLoadingId === t.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : previewingId === t.id ? (
                            <Pause size={13} />
                          ) : (
                            <Play size={13} />
                          )}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-md shrink-0 bg-cover bg-center"
                            style={{
                              backgroundImage: t.coverUrl ? `url(${t.coverUrl})` : undefined,
                              background: t.coverUrl ? undefined : `linear-gradient(135deg, ${t.gradient[0]}, ${t.gradient[1]})`,
                            }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-fg truncate max-w-[180px]">{t.title}</p>
                            <p className="text-[11px] text-fg-subtle truncate md:hidden">{t.artistName ?? "Unknown"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 hidden md:table-cell text-fg-muted truncate max-w-[160px]">{t.artistName ?? "Unknown"}</td>
                      <td className="py-2 pr-3 hidden lg:table-cell text-fg-muted truncate max-w-[160px]">{t.albumTitle ?? "—"}</td>
                      <td className="py-2 pr-3 hidden sm:table-cell">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-hover text-fg-muted">
                          {RELEASE_TYPE_LABEL[t.releaseType]}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-fg-muted tabular-nums">{formatDuration(t.duration)}</td>
                      <td className="py-2 pr-3 text-right hidden sm:table-cell text-fg-muted tabular-nums">{(t.playCount ?? 0).toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/admin/library?track=${t.id}`}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-brand hover:bg-elevated-hover transition-colors"
                            aria-label={`Edit ${t.title}`}
                          >
                            <Pencil size={13} />
                          </Link>
                          <button
                            onClick={() => setConfirmDelete(t)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors"
                            aria-label={`Delete ${t.title}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pageRows.length === 0 && <p className="text-sm text-fg-subtle text-center py-10">No songs match.</p>}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-fg-subtle">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border text-fg-muted hover:text-fg disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border text-fg-muted hover:text-fg disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-panel border border-border p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-fg mb-1">Delete "{confirmDelete.title}"?</h3>
            <p className="text-xs text-fg-muted mb-4">This permanently removes the song. This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-fg-muted hover:bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => runDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-red text-white disabled:opacity-50"
              >
                {deletingId === confirmDelete.id && <Loader2 size={12} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
