import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  RefreshCw,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import ImportHistoryPanel from "../components/ImportHistoryPanel";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import {
  adminApi,
  artistsApi,
  type ApiArtist,
  type YoutubeCatalogBatch,
  type YoutubeCatalogBatchSummary,
  type YoutubeCatalogItem,
} from "../lib/api";
import { formatDuration } from "../utils/format";

// Mirrors the server's normalizeForMatch (server/src/artwork/matching.ts)
// closely enough for a client-side hard-block check before submitting —
// the server re-validates authoritatively regardless, this is just so the
// admin sees the conflict immediately instead of after a round trip.
function normalizeArtistName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const POLL_INTERVAL_MS = 1500;
const ACTIVE_ITEM_STATUSES = new Set(["selected", "downloading", "processing", "uploading", "saving"]);
const HISTORY_PAGE_SIZE = 10;

function statusIcon(status: YoutubeCatalogItem["status"]) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={16} className="text-brand shrink-0" />;
    case "error":
      return <XCircle size={16} className="text-accent-red shrink-0" />;
    case "skipped_duplicate":
      return <Circle size={16} className="text-fg-subtle shrink-0" />;
    case "cancelled":
      return <X size={16} className="text-fg-subtle shrink-0" />;
    case "pending":
      return null;
    default:
      return <Loader2 size={16} className="animate-spin text-brand shrink-0" />;
  }
}

interface ImportItemRowProps {
  id: string;
  title: string;
  status: YoutubeCatalogItem["status"];
  message: string | null;
  error: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  selected: boolean;
  phase: "form" | "enumerating" | "selecting" | "importing" | "done" | "error";
  onToggleSelect: (id: string) => void;
  onCancel: (id: string) => void;
}

// Split out and memoized so a poll tick's fresh batch object (a new item
// array/reference every ~1.5s during an active import, see POLL_INTERVAL_MS)
// only actually re-renders the handful of rows whose real fields changed —
// not all 100+ rows a big channel import can have. Un-memoized, every row
// re-rendering on every tick (images included) was heavy enough, combined
// with the concurrent yt-dlp/ffmpeg work, to make the page's scroll feel
// stuck/janky. onToggleSelect/onCancel must be stable function references
// (see toggleSelectItem/cancelSingleItem below) — an inline closure recreated
// every parent render would defeat this memoization entirely.
const ImportItemRow = memo(function ImportItemRow({
  id,
  title,
  status,
  message,
  error,
  thumbnailUrl,
  duration,
  selected,
  phase,
  onToggleSelect,
  onCancel,
}: ImportItemRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {phase === "selecting" ? (
        status === "skipped_duplicate" ? (
          <span className="w-4 h-4 shrink-0" />
        ) : (
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(id)} className="shrink-0" />
        )
      ) : (
        statusIcon(status)
      )}
      {thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0 bg-panel" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{title}</p>
        {phase !== "selecting" && message && (
          // Not truncated (unlike the title above) — an error here is the
          // full backend reason (see server/src/youtube/safeError.ts) and
          // getting cut off with "..." is exactly what made the last
          // reported failure unreadable/undiagnosable from the UI alone.
          <p className="text-xs text-fg-muted break-words">{error ?? message}</p>
        )}
        {status === "skipped_duplicate" && <p className="text-xs text-fg-subtle">Already in catalog</p>}
      </div>
      {duration != null && <span className="text-xs text-fg-muted shrink-0">{formatDuration(duration)}</span>}
      {phase === "importing" && ACTIVE_ITEM_STATUSES.has(status) && (
        <button
          onClick={() => onCancel(id)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-hover transition-colors shrink-0"
          aria-label="Cancel this song"
          title="Cancel this song"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});

export default function YoutubeCatalogImport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [url, setUrl] = useState("");
  const [confirmRights, setConfirmRights] = useState(false);
  // "Allow duplicate imports" — off by default (skip anything that already
  // exists, today's behavior). When on, every album/single/track in this
  // batch imports as a brand-new library item instead of being matched or
  // skipped against existing content.
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  // "Regular Album" (default) vs "Concert Album" — whichever Album row(s)
  // this batch creates get tagged accordingly (see
  // routes/youtubeCatalogImport.ts). Deep-linkable from Home's Concerts
  // section (?destination=concert), same pattern as the single-video
  // import screen's own ?destination=live.
  const [destinationType, setDestinationType] = useState<"album" | "concert">(
    () => (searchParams.get("destination") === "concert" ? "concert" : "album")
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Artist targeting — required, explicit, never guessed from the channel
  // name. "existing" reuses a catalog artist; "new" hard-blocks (both here
  // and, authoritatively, server-side) on a normalized-name match against
  // an artist that already exists.
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [artistMode, setArtistMode] = useState<"existing" | "new">("existing");
  const [artistQuery, setArtistQuery] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [newArtistName, setNewArtistName] = useState("");

  useEffect(() => {
    artistsApi.list().then(setArtists);
  }, []);

  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    return q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists;
  }, [artists, artistQuery]);

  const duplicateArtistMatch = useMemo(() => {
    const name = newArtistName.trim();
    if (artistMode !== "new" || !name) return null;
    const normalized = normalizeArtistName(name);
    return artists.find((a) => normalizeArtistName(a.name) === normalized) ?? null;
  }, [artistMode, newArtistName, artists]);

  const [history, setHistory] = useState<YoutubeCatalogBatchSummary[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<YoutubeCatalogBatch | null>(null);
  // Lets toggleSelectItem/cancelSingleItem read the current batch without
  // being recreated every time `batch` itself changes (every poll tick) —
  // see ImportItemRow above for why keeping their identity stable matters.
  const batchRef = useRef(batch);
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  const [showingSelection, setShowingSelection] = useState(false);
  const [collapsedAlbums, setCollapsedAlbums] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHistory = () =>
    adminApi
      .listYoutubeCatalogBatches({
        q: historyQuery || undefined,
        status: historyStatus || undefined,
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
      })
      .then((res) => {
        setHistory(res.batches);
        setHistoryTotal(res.total);
      })
      .catch(() => {});

  useEffect(() => {
    loadHistory();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage, historyQuery, historyStatus]);

  const toggleHistorySelected = (id: string) => {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteHistoryEntry = async (id: string) => {
    await adminApi.deleteYoutubeCatalogBatch(id);
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    loadHistory();
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    await adminApi.deleteSelectedYoutubeCatalogBatches([...selectedHistoryIds]);
    setSelectedHistoryIds(new Set());
    loadHistory();
  };

  const clearCompletedHistory = async () => {
    await adminApi.clearCompletedYoutubeCatalogBatches();
    loadHistory();
  };

  const clearFailedHistory = async () => {
    await adminApi.clearFailedYoutubeCatalogBatches();
    loadHistory();
  };

  const clearAllHistory = async () => {
    await adminApi.clearAllYoutubeCatalogBatches();
    loadHistory();
  };

  const retryHistoryEntry = async (b: YoutubeCatalogBatchSummary) => {
    const full = await adminApi.getYoutubeCatalogBatch(b.id);
    const failedIds = full.items.filter((i) => i.status === "error").map((i) => i.id);
    if (failedIds.length > 0) {
      await adminApi.selectYoutubeCatalogItems(b.id, { selected: true, itemIds: failedIds });
      await adminApi.startYoutubeCatalogImport(b.id);
    }
    openBatch(b.id);
  };

  const renameHistoryEntry = async (id: string, label: string | null) => {
    await adminApi.renameYoutubeCatalogBatch(id, label);
    loadHistory();
  };

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  const openBatch = (batchId: string) => {
    setShowingSelection(false);
    adminApi.getYoutubeCatalogBatch(batchId).then(setBatch);
    poll(batchId);
  };

  const poll = (batchId: string) => {
    stopPolling();
    pollRef.current = setTimeout(async () => {
      try {
        const latest = await adminApi.getYoutubeCatalogBatch(batchId);
        setBatch(latest);
        if (latest.status === "enumerating" || latest.status === "importing") {
          poll(batchId);
        } else {
          loadHistory();
        }
      } catch {
        // transient network hiccup — try again on the next tick
        poll(batchId);
      }
    }, POLL_INTERVAL_MS);
  };

  const startEnumeration = async () => {
    setFormError(null);
    if (!url.trim()) {
      setFormError("Paste a YouTube channel/artist URL first");
      return;
    }
    if (!confirmRights) {
      setFormError("You must confirm you have permission to use this content");
      return;
    }
    if (artistMode === "existing" && !selectedArtistId) {
      setFormError("Choose an existing artist to import into");
      return;
    }
    if (artistMode === "new" && !newArtistName.trim()) {
      setFormError("Enter a name for the new artist");
      return;
    }
    if (artistMode === "new" && duplicateArtistMatch) {
      setFormError(`An artist named "${duplicateArtistMatch.name}" already exists — choose it from Existing Artist, or use a different name.`);
      return;
    }
    setSubmitting(true);
    try {
      const { batchId } = await adminApi.startYoutubeCatalogEnumeration({
        url: url.trim(),
        confirmRights,
        artistMode,
        artistId: artistMode === "existing" ? selectedArtistId : undefined,
        artistName: artistMode === "new" ? newArtistName.trim() : undefined,
        allowDuplicates,
        destinationType,
      });
      setUrl("");
      setConfirmRights(false);
      setAllowDuplicates(false);
      setNewArtistName("");
      setSelectedArtistId("");
      openBatch(batchId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start import");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshBatch = async () => {
    if (!batch) return;
    const latest = await adminApi.getYoutubeCatalogBatch(batch.id);
    setBatch(latest);
  };

  const toggleAlbum = (albumTitle: string) => {
    setCollapsedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(albumTitle)) next.delete(albumTitle);
      else next.add(albumTitle);
      return next;
    });
  };

  // Each of these applies the change to local state immediately so the
  // checkbox/count reflects the tap instantly instead of waiting on a round
  // trip — the network call still happens right after and refreshBatch()
  // still reconciles with the server's actual state, this just removes the
  // visible lag (and the race window where a second rapid tap on the same
  // item would read a stale `.selected` before the first request resolved).
  const selectAll = async (selected: boolean) => {
    if (!batch) return;
    setBatch((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) => (i.status === "pending" || i.status === "error" || i.status === "cancelled" ? { ...i, selected } : i)),
          }
        : b
    );
    await adminApi.selectYoutubeCatalogItems(batch.id, { selected, all: true });
    await refreshBatch();
  };

  // "Import Albums Only" / "Import Singles Only" / "Import Albums & Singles"
  // — selects every item of the wanted kind and deselects the other, reusing
  // the same selection endpoint the per-album/select-all controls already use.
  const filterByKind = async (want: "album" | "single" | "both") => {
    if (!batch) return;
    const wantAlbums = want !== "single";
    const wantSingles = want !== "album";
    setBatch((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) =>
              i.status === "pending" || i.status === "error" || i.status === "cancelled"
                ? { ...i, selected: i.albumTitle !== null ? wantAlbums : wantSingles }
                : i
            ),
          }
        : b
    );
    await Promise.all([
      adminApi.selectYoutubeCatalogItems(batch.id, { selected: wantAlbums, hasAlbum: true }),
      adminApi.selectYoutubeCatalogItems(batch.id, { selected: wantSingles, hasAlbum: false }),
    ]);
    await refreshBatch();
  };

  const selectAlbum = async (albumTitle: string | null, selected: boolean) => {
    if (!batch) return;
    setBatch((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) =>
              i.albumTitle === albumTitle && (i.status === "pending" || i.status === "error" || i.status === "cancelled")
                ? { ...i, selected }
                : i
            ),
          }
        : b
    );
    await adminApi.selectYoutubeCatalogItems(batch.id, { selected, albumTitle });
    await refreshBatch();
  };

  // Stable identity (empty dep array, reads batchRef instead of closing over
  // `batch` directly) so ImportItemRow's memoization actually holds across
  // poll ticks — see that component's comment for why.
  const toggleSelectItem = useCallback(async (itemId: string) => {
    const current = batchRef.current;
    if (!current) return;
    const item = current.items.find((i) => i.id === itemId);
    if (!item) return;
    const nextSelected = !item.selected;
    setBatch((b) =>
      b ? { ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, selected: nextSelected } : i)) } : b
    );
    await adminApi.selectYoutubeCatalogItems(current.id, { selected: nextSelected, itemIds: [itemId] });
    const latest = await adminApi.getYoutubeCatalogBatch(current.id);
    setBatch(latest);
  }, []);

  const startImport = async () => {
    if (!batch) return;
    await adminApi.startYoutubeCatalogImport(batch.id);
    setShowingSelection(false);
    openBatch(batch.id);
  };

  const resumeStalled = async () => {
    if (!batch) return;
    await adminApi.resumeYoutubeCatalogImport(batch.id);
    poll(batch.id);
  };

  const stopImport = async () => {
    if (!batch) return;
    await adminApi.stopYoutubeCatalogImport(batch.id);
    openBatch(batch.id);
  };

  const cancelSingleItem = useCallback(async (itemId: string) => {
    const current = batchRef.current;
    if (!current) return;
    // Optimistic: flip it to "cancelled" (hiding the X button and showing
    // the cancelled label) the instant it's clicked, rather than waiting on
    // the round trip — the actual kill signal is already sent by the time
    // this call resolves, the fetch below just confirms the true state.
    setBatch((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) =>
              i.id === itemId ? { ...i, status: "cancelled", message: "Cancelled", selected: false } : i
            ),
          }
        : b
    );
    await adminApi.cancelYoutubeCatalogItem(current.id, itemId);
    const latest = await adminApi.getYoutubeCatalogBatch(current.id);
    setBatch(latest);
  }, []);

  const startFresh = () => {
    stopPolling();
    setBatch(null);
    setShowingSelection(false);
  };

  const groups = useMemo(() => {
    if (!batch) return [];
    const byAlbum = new Map<string | null, YoutubeCatalogItem[]>();
    for (const item of batch.items) {
      const key = item.albumTitle;
      if (!byAlbum.has(key)) byAlbum.set(key, []);
      byAlbum.get(key)!.push(item);
    }
    const albums = [...byAlbum.entries()].filter((entry): entry is [string, YoutubeCatalogItem[]] => entry[0] !== null);
    const ungrouped = byAlbum.get(null) ?? [];
    return ungrouped.length > 0 ? [...albums, [null, ungrouped] as [null, YoutubeCatalogItem[]]] : albums;
  }, [batch]);

  const selectableCount = batch?.items.filter((i) => i.status === "pending" || i.status === "error" || i.status === "cancelled").length ?? 0;
  const selectedCount = batch?.items.filter((i) => i.selected && (i.status === "pending" || i.status === "error" || i.status === "cancelled")).length ?? 0;
  const doneCount = batch?.items.filter((i) => i.status === "done").length ?? 0;
  const errorCount = batch?.items.filter((i) => i.status === "error").length ?? 0;
  const skippedCount = batch?.items.filter((i) => i.status === "skipped_duplicate").length ?? 0;
  const activeCount = batch?.items.filter((i) => ACTIVE_ITEM_STATUSES.has(i.status)).length ?? 0;
  const importTotal = doneCount + errorCount + activeCount;

  // Six-bucket import summary — derived purely from each item's albumTitle
  // (album vs. single) and its trackWasNew/albumWasNew flags (set once by
  // the worker when the item finishes; see YoutubeImportItem in the Prisma
  // schema for why these are snapshot-based rather than live counters).
  const summary = useMemo(() => {
    const items = (batch?.items ?? []).filter((i) => i.status === "done" || i.status === "skipped_duplicate");
    const albumItems = items.filter((i) => i.albumTitle !== null);
    const singleItems = items.filter((i) => i.albumTitle === null);

    const albumTitles = new Set(albumItems.map((i) => i.albumTitle as string));
    let newAlbums = 0;
    let existingAlbums = 0;
    for (const title of albumTitles) {
      const isNew = albumItems.some((i) => i.albumTitle === title && i.albumWasNew === true);
      if (isNew) newAlbums++;
      else existingAlbums++;
    }

    return {
      newAlbums,
      existingAlbums,
      newSingles: singleItems.filter((i) => i.trackWasNew === true).length,
      existingSingles: singleItems.filter((i) => i.trackWasNew === false).length,
      newTracks: albumItems.filter((i) => i.trackWasNew === true).length,
      existingTracks: albumItems.filter((i) => i.trackWasNew === false).length,
    };
  }, [batch]);

  const phase: "form" | "enumerating" | "selecting" | "importing" | "done" | "error" = !batch
    ? "form"
    : batch.status === "enumerating"
      ? "enumerating"
      : batch.status === "error"
        ? "error"
        : batch.status === "importing"
          ? "importing"
          : batch.status === "ready" || batch.status === "stopped" || showingSelection
            ? "selecting"
            : "done";

  if (user?.role !== "admin") {
    return (
      <div className="relative px-6 py-10 max-w-lg">
        <BackButton />
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 pb-28 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back to Home"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Import Artist Catalog</h1>
          <p className="text-sm text-fg-muted mt-1">
            Paste a whole channel/artist to pull in everything at once, or paste a single YouTube playlist URL to
            import just that playlist as one album.
          </p>
        </div>
      </div>

      <div className="bg-elevated rounded-lg p-4 flex items-start gap-3 mb-6 text-sm text-fg-muted">
        <AlertCircle size={18} className="shrink-0 mt-0.5 text-accent-red" />
        <p>
          Only import channels you own or have explicit permission to use. Downloading and rehosting copyrighted
          YouTube content without authorization can violate YouTube's Terms of Service and copyright law. Every
          import is logged with your account and the source video.
        </p>
      </div>

      {phase === "form" && (
        <>
          <ImportHistoryPanel
            history={history}
            historyTotal={historyTotal}
            historyPage={historyPage}
            setHistoryPage={setHistoryPage}
            historyQuery={historyQuery}
            setHistoryQuery={setHistoryQuery}
            historyStatus={historyStatus}
            setHistoryStatus={setHistoryStatus}
            selectedHistoryIds={selectedHistoryIds}
            toggleHistorySelected={toggleHistorySelected}
            openBatch={openBatch}
            deleteHistoryEntry={deleteHistoryEntry}
            deleteSelectedHistory={deleteSelectedHistory}
            clearCompletedHistory={clearCompletedHistory}
            clearFailedHistory={clearFailedHistory}
            clearAllHistory={clearAllHistory}
            retryHistoryEntry={retryHistoryEntry}
            renameHistoryEntry={renameHistoryEntry}
          />

          <div className="bg-elevated rounded-lg p-4 flex flex-col gap-3 mb-4">
            <p className="text-xs font-bold text-fg-muted uppercase tracking-wide">Import into</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setArtistMode("existing")}
                className={`flex-1 text-sm font-semibold px-3 py-2 rounded-full transition-colors ${
                  artistMode === "existing" ? "bg-brand text-black" : "bg-panel text-fg-muted hover:text-fg"
                }`}
              >
                Existing Artist
              </button>
              <button
                onClick={() => setArtistMode("new")}
                className={`flex-1 text-sm font-semibold px-3 py-2 rounded-full transition-colors ${
                  artistMode === "new" ? "bg-brand text-black" : "bg-panel text-fg-muted hover:text-fg"
                }`}
              >
                Create New Artist
              </button>
            </div>

            {artistMode === "existing" && (
              <>
                <TextField
                  type="text"
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  placeholder="Search artists..."
                  variant="panel"
                  className="px-3 py-2 text-base"
                />
                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                  {filteredArtists.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedArtistId(a.id)}
                      className={`flex items-center gap-3 px-2 py-2 rounded-md hover:bg-hover transition-colors text-left ${
                        selectedArtistId === a.id ? "ring-1 ring-brand/60 bg-brand/5" : ""
                      }`}
                    >
                      <CoverArt gradient={a.gradient} size="sm" photoUrl={a.photoUrl} rounded />
                      <p className="text-sm font-medium truncate flex-1">{a.name}</p>
                      {selectedArtistId === a.id && <Check size={16} className="text-brand shrink-0" />}
                    </button>
                  ))}
                  {filteredArtists.length === 0 && (
                    <p className="text-sm text-fg-muted px-2 py-4 text-center">No artists found.</p>
                  )}
                </div>
              </>
            )}

            {artistMode === "new" && (
              <>
                <TextField
                  type="text"
                  value={newArtistName}
                  onChange={(e) => setNewArtistName(e.target.value)}
                  placeholder="New artist name"
                  variant="panel"
                  className="px-3 py-2 text-base"
                />
                {duplicateArtistMatch && (
                  <div className="flex items-center gap-3 bg-panel rounded-md p-2.5">
                    <CoverArt gradient={duplicateArtistMatch.gradient} size="sm" photoUrl={duplicateArtistMatch.photoUrl} rounded />
                    <p className="text-xs text-fg-muted flex-1">
                      An artist named "{duplicateArtistMatch.name}" already exists.
                    </p>
                    <button
                      onClick={() => {
                        setArtistMode("existing");
                        setSelectedArtistId(duplicateArtistMatch.id);
                        setArtistQuery("");
                      }}
                      className="text-xs font-semibold text-brand hover:underline shrink-0"
                    >
                      Use it
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-elevated rounded-lg p-4 flex flex-col gap-3 mb-4">
            <p className="text-xs font-bold text-fg-muted uppercase tracking-wide">Import as</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDestinationType("album")}
                className={`flex-1 text-sm font-semibold px-3 py-2 rounded-full transition-colors ${
                  destinationType === "album" ? "bg-brand text-black" : "bg-panel text-fg-muted hover:text-fg"
                }`}
              >
                Regular Album
              </button>
              <button
                onClick={() => setDestinationType("concert")}
                className={`flex-1 text-sm font-semibold px-3 py-2 rounded-full transition-colors ${
                  destinationType === "concert" ? "bg-brand text-black" : "bg-panel text-fg-muted hover:text-fg"
                }`}
              >
                Concert Album
              </button>
            </div>
            {destinationType === "concert" && (
              <p className="text-xs text-fg-muted -mt-1">
                Every album this batch creates shows up in Home → Concerts instead of the regular Albums section —
                ideal for a single playlist that's one whole concert recording.
              </p>
            )}
          </div>

          <div className="bg-elevated rounded-lg p-4 flex flex-col gap-3">
            <TextField
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Channel URL, or a single playlist URL to import as one album"
              variant="panel"
              className="px-3 py-2 text-base"
            />
            <p className="text-xs text-fg-muted -mt-1.5">
              Whole channel: <span className="text-fg-subtle">https://www.youtube.com/@channelname</span> · One
              album: <span className="text-fg-subtle">https://www.youtube.com/playlist?list=...</span>
            </p>
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmRights}
                onChange={(e) => setConfirmRights(e.target.checked)}
                className="mt-0.5"
              />
              <span>I own this channel's content or have explicit permission to download and use it.</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowDuplicates}
                onChange={(e) => setAllowDuplicates(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Allow duplicate imports
                <span className="block text-xs text-fg-muted mt-0.5">
                  Import albums, singles, and tracks even if they already exist, as new separate items — instead of
                  skipping duplicates (the default).
                </span>
              </span>
            </label>
            {formError && (
              <p className="flex items-center gap-2 text-sm text-accent-red">
                <AlertCircle size={14} />
                {formError}
              </p>
            )}
            <button
              onClick={startEnumeration}
              disabled={submitting || Boolean(duplicateArtistMatch)}
              className="self-start flex items-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Find Catalog
            </button>
          </div>
        </>
      )}

      {phase === "enumerating" && (
        <div className="bg-elevated rounded-lg p-6 flex flex-col items-center gap-3 text-center">
          <Loader2 size={28} className="animate-spin text-brand" />
          <p className="text-sm text-fg-muted">
            Scanning channel for playlists and videos… this can take a minute for channels with many playlists.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="bg-elevated rounded-lg p-6 flex flex-col items-center gap-3 text-center">
          <AlertCircle size={24} className="text-accent-red" />
          <p className="text-sm text-accent-red">{batch?.error ?? "Something went wrong"}</p>
          <button
            onClick={startFresh}
            className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-full hover:bg-hover transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {(phase === "selecting" || phase === "importing" || phase === "done") && batch && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-bold">{batch.channelName ?? batch.sourceUrl}</p>
              <p className="text-xs text-fg-muted">{batch.items.length} songs found</p>
            </div>
            <button
              onClick={startFresh}
              className="text-sm font-semibold text-fg-muted hover:text-fg px-3 py-1.5 rounded-full hover:bg-hover transition-colors"
            >
              Import another channel
            </button>
          </div>

          {batch.error && (
            <p className="flex items-center gap-2 text-xs text-accent-red">
              <AlertCircle size={12} />
              {batch.error}
            </p>
          )}

          {batch.status === "stopped" && (
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              <Square size={12} />
              Stopped — {doneCount} imported so far. Review your selection below and start again whenever you're
              ready.
            </p>
          )}

          {phase === "selecting" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => filterByKind("album")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-elevated hover:bg-elevated-hover transition-colors"
                >
                  Import Albums Only
                </button>
                <button
                  onClick={() => filterByKind("single")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-elevated hover:bg-elevated-hover transition-colors"
                >
                  Import Singles Only
                </button>
                <button
                  onClick={() => filterByKind("both")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-elevated hover:bg-elevated-hover transition-colors"
                >
                  Import Albums &amp; Singles
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => selectAll(true)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-full bg-elevated hover:bg-elevated-hover transition-colors"
                >
                  Select all
                </button>
                <button
                  onClick={() => selectAll(false)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-full bg-elevated hover:bg-elevated-hover transition-colors"
                >
                  Deselect all
                </button>
                <span className="text-sm text-fg-muted ml-auto">
                  {selectedCount} of {selectableCount} selectable songs chosen
                </span>
              </div>
            </div>
          )}

          {phase === "importing" && (
            <div className="bg-elevated rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">
                  Importing… {doneCount + errorCount} of {importTotal || selectedCount}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={resumeStalled}
                    className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1 rounded-md hover:bg-hover transition-colors"
                  >
                    <RefreshCw size={12} />
                    Resume stalled items
                  </button>
                  <button
                    onClick={stopImport}
                    className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-accent-red px-2 py-1 rounded-md hover:bg-hover transition-colors"
                  >
                    <Square size={12} />
                    Stop
                  </button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-panel overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300"
                  style={{
                    width: `${Math.max(4, importTotal ? ((doneCount + errorCount) / importTotal) * 100 : 0)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-fg-muted">
                {doneCount} imported · {errorCount} failed · {skippedCount} already in catalog
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className="bg-elevated rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-brand" />
                <p className="font-semibold">
                  {doneCount} imported, {skippedCount} already in catalog, {errorCount} failed
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-fg-muted bg-panel rounded-md p-3">
                <span>New albums imported</span>
                <span className="text-fg font-semibold text-right">{summary.newAlbums}</span>
                <span>Existing albums skipped</span>
                <span className="text-fg font-semibold text-right">{summary.existingAlbums}</span>
                <span>New singles imported</span>
                <span className="text-fg font-semibold text-right">{summary.newSingles}</span>
                <span>Existing singles skipped</span>
                <span className="text-fg font-semibold text-right">{summary.existingSingles}</span>
                <span>New tracks imported</span>
                <span className="text-fg font-semibold text-right">{summary.newTracks}</span>
                <span>Existing tracks skipped</span>
                <span className="text-fg font-semibold text-right">{summary.existingTracks}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate("/")}
                  className="bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform"
                >
                  Go to Home
                </button>
                {batch.items.some((i) => i.status === "pending" || i.status === "cancelled") && (
                  <button
                    onClick={() => setShowingSelection(true)}
                    className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-full hover:bg-hover transition-colors"
                  >
                    Select more songs
                  </button>
                )}
                {errorCount > 0 && (
                  <button
                    onClick={async () => {
                      await adminApi.selectYoutubeCatalogItems(batch.id, {
                        selected: true,
                        itemIds: batch.items.filter((i) => i.status === "error").map((i) => i.id),
                      });
                      await startImport();
                    }}
                    className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-full hover:bg-hover transition-colors"
                  >
                    Retry {errorCount} failed
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {groups.map(([albumTitle, items]) => {
              const key = albumTitle ?? "__ungrouped__";
              const collapsed = collapsedAlbums.has(key);
              const selectableInAlbum = items.filter((i) => i.status === "pending" || i.status === "error" || i.status === "cancelled");
              const allSelected = selectableInAlbum.length > 0 && selectableInAlbum.every((i) => i.selected);
              return (
                <div key={key} className="bg-elevated rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleAlbum(key)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-elevated-hover transition-colors text-left"
                  >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span className="font-semibold text-sm">{albumTitle ?? "Songs"}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-fg-subtle bg-panel px-1.5 py-0.5 rounded">
                      {albumTitle ? "Album" : "Single"}
                    </span>
                    <span className="text-xs text-fg-muted flex-1">{items.length}</span>
                    {phase === "selecting" && selectableInAlbum.length > 0 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAlbum(albumTitle, !allSelected);
                        }}
                        className="ml-2 text-xs font-semibold text-brand hover:underline"
                      >
                        {allSelected ? "Deselect all" : "Select all"}
                      </span>
                    )}
                  </button>
                  {!collapsed && (
                    <div className="divide-y divide-border">
                      {items.map((item) => (
                        <ImportItemRow
                          key={item.id}
                          id={item.id}
                          title={item.title}
                          status={item.status}
                          message={item.message}
                          error={item.error}
                          thumbnailUrl={item.thumbnailUrl}
                          duration={item.duration}
                          selected={item.selected}
                          phase={phase}
                          onToggleSelect={toggleSelectItem}
                          onCancel={cancelSingleItem}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {phase === "selecting" && (
            <button
              onClick={startImport}
              disabled={selectedCount === 0}
              className="self-start flex items-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
            >
              <Check size={16} />
              Import {selectedCount} selected song{selectedCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
