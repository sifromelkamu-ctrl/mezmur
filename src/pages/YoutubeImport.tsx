import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clapperboard,
  Disc3,
  Loader2,
  Music2,
  Sparkles,
  Ticket,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import {
  adminApi,
  albumsApi,
  artistsApi,
  type ApiAlbum,
  type ApiArtist,
  type YoutubeImportJob,
} from "../lib/api";
import { formatDuration } from "../utils/format";

type Phase = "idle" | "polling" | "done" | "error";

// The destination step this screen adds on top of the existing import
// pipeline (see startImport below) — it only ever changes which existing
// album (if any) the imported track is attached to; the download/convert/
// upload mechanics are completely unchanged.
type Destination = "album" | "single" | "live";

const DESTINATIONS: { id: Destination; label: string; icon: typeof Disc3 }[] = [
  { id: "album", label: "Album", icon: Disc3 },
  { id: "single", label: "Single", icon: Music2 },
  { id: "live", label: "Concert Album", icon: Ticket },
];

// The URL/destination form vs. the Single-only "Edit Metadata" review step —
// distinct from Phase, which describes the background job's own lifecycle
// once an import actually starts.
type Step = "form" | "metadata";

interface PreviewResult {
  title: string;
  artistName: string;
  thumbnail: string | null;
  duration: number | null;
}

const POLL_INTERVAL_MS = 1000;

export default function YoutubeImport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [confirmRights, setConfirmRights] = useState(false);
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [destination, setDestination] = useState<Destination>("single");
  const [albumId, setAlbumId] = useState("");
  const [genre, setGenre] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [job, setJob] = useState<YoutubeImportJob | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Edit Metadata" step (Single destination only) — pre-filled from a
  // lightweight preview fetch (no download, nothing created yet), editable,
  // and cached against the URL it was fetched for so navigating Back and
  // forward again doesn't re-fetch unless the URL actually changed.
  const [step, setStep] = useState<Step>("form");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewedUrl, setPreviewedUrl] = useState<string | null>(null);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaArtistName, setMetaArtistName] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);

  useEffect(() => {
    albumsApi.list().then(setAlbums);
    artistsApi.list().then(setArtists);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Regular Albums and Concert Albums are both just Album rows, distinguished
  // only by albumType — this is the same list either destination picks from,
  // just filtered to the relevant type so an import can never land in the
  // wrong section (see Content Separation: Albums/Singles/Concerts never mix).
  const destinationAlbums = albums.filter((al) =>
    destination === "live" ? al.albumType === "live" : al.albumType !== "live"
  );

  const selectDestination = (next: Destination) => {
    setDestination(next);
    setAlbumId("");
  };

  const typedArtistName = metaArtistName.trim();
  const exactArtistMatch = artists.find((a) => a.name.toLowerCase() === typedArtistName.toLowerCase());
  // What Import will actually do with the artist — computed live so the
  // admin always knows before confirming, never silently guessed.
  const resolvedArtistId = selectedArtistId ?? exactArtistMatch?.id ?? null;
  const artistSuggestions = typedArtistName
    ? artists.filter((a) => a.name.toLowerCase().includes(typedArtistName.toLowerCase())).slice(0, 6)
    : [];

  const pollJob = (jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const latest = await adminApi.getYoutubeImportStatus(jobId);
        setJob(latest);
        if (latest.status === "done") {
          setPhase("done");
        } else if (latest.status === "error") {
          setPhase("error");
        } else {
          pollJob(jobId);
        }
      } catch (err) {
        setPhase("error");
        setJob((prev) => (prev ? { ...prev, error: err instanceof Error ? err.message : "Lost connection to import job" } : prev));
      }
    }, POLL_INTERVAL_MS);
  };

  const validateForm = () => {
    if (!url.trim()) return "Paste a YouTube URL first";
    if (!confirmRights) return "You must confirm you have permission to use this content";
    if (destination === "album" && !albumId) return "Select which album this track belongs to";
    if (destination === "live" && !albumId) return "Select which concert album this track belongs to";
    return null;
  };

  // "Next" (Single destination only) — fetches title/artist/thumbnail with
  // no download and nothing created yet, then opens the Edit Metadata step.
  const goToMetadataStep = async () => {
    setSubmitError(null);
    const error = validateForm();
    if (error) {
      setSubmitError(error);
      return;
    }
    const trimmedUrl = url.trim();
    if (preview && previewedUrl === trimmedUrl) {
      setStep("metadata");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await adminApi.previewYoutubeImport(trimmedUrl);
      setPreview(result);
      setPreviewedUrl(trimmedUrl);
      setMetaTitle(result.title);
      setMetaArtistName(result.artistName);
      setSelectedArtistId(null);
      setStep("metadata");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not fetch video info");
    } finally {
      setPreviewLoading(false);
    }
  };

  const startImport = async () => {
    setSubmitError(null);
    const error = validateForm();
    if (error) {
      setSubmitError(error);
      return;
    }
    if (destination === "single" && !metaTitle.trim()) {
      setSubmitError("Song title can't be empty");
      return;
    }
    if (destination === "single" && !typedArtistName) {
      setSubmitError("Enter or select an artist");
      return;
    }
    setSubmitting(true);
    try {
      const { jobId } = await adminApi.startYoutubeImport({
        url: url.trim(),
        confirmRights,
        albumId: albumId || undefined,
        genre: genre.trim() || undefined,
        isSingle: destination === "single",
        ...(destination === "single"
          ? {
              // Never sets createArtist — a Single either links to an exact
              // existing-name match (resolvedArtistId) or is imported with
              // artistId left null and this typed name stored as a
              // per-track override (see youtube/pipeline.ts's
              // findExistingArtist). It must never silently create a new
              // Artist row / Artist page just because the typed name is new.
              titleOverride: metaTitle.trim(),
              artistId: resolvedArtistId ?? undefined,
              artistName: resolvedArtistId ? undefined : typedArtistName,
            }
          : {}),
      });
      setJob({ id: jobId, status: "pending", progress: 0, message: "Fetching video info…" });
      setPhase("polling");
      pollJob(jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not start import");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setPhase("idle");
    setJob(null);
    setUrl("");
    setConfirmRights(false);
    setGenre("");
    setDestination("single");
    setAlbumId("");
    setSubmitError(null);
    setStep("form");
    setPreview(null);
    setPreviewedUrl(null);
    setMetaTitle("");
    setMetaArtistName("");
    setSelectedArtistId(null);
  };

  if (user?.role !== "admin") {
    return (
      <div className="relative px-6 py-10 max-w-lg">
        <BackButton />
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => (step === "metadata" ? setStep("form") : navigate("/"))}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label={step === "metadata" ? "Back" : "Back to Home"}
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">
            {step === "metadata" && (phase === "idle" || phase === "error") ? "Edit Metadata" : "Import from YouTube"}
          </h1>
          <p className="text-sm text-fg-muted mt-1">
            {step === "metadata" && (phase === "idle" || phase === "error")
              ? "Review and edit before this is imported."
              : "Download the audio from a YouTube video and add it to the catalog."}
          </p>
        </div>
      </div>

      {step === "form" && (phase === "idle" || phase === "error") && (
        <div className="bg-elevated rounded-lg p-4 flex items-start gap-3 mb-6 text-sm text-fg-muted">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-accent-red" />
          <p>
            Only import videos you own or have explicit permission to use. Downloading and rehosting copyrighted
            YouTube content without authorization can violate YouTube's Terms of Service and copyright law. Every
            import is logged with your account and the source video.
          </p>
        </div>
      )}

      {step === "form" && (phase === "idle" || phase === "error") && (
        <div className="bg-elevated rounded-lg p-4 flex flex-col gap-3">
          <TextField
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            variant="panel"
            className="px-3 py-2 text-base"
          />

          <div>
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Import as</p>
            <div className="grid grid-cols-3 gap-2">
              {DESTINATIONS.map((dest) => {
                const Icon = dest.icon;
                const active = destination === dest.id;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => selectDestination(dest.id)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-colors ${
                      active ? "border-brand bg-brand/10 text-fg" : "border-transparent bg-panel text-fg-muted hover:text-fg"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-brand" : ""} />
                    <span className="text-xs font-semibold">{dest.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {destination === "single" ? (
              <p className="text-sm text-fg-muted bg-panel rounded-md px-3 py-2">
                This track will be imported as a standalone single — no album. You'll review its title and artist
                next.
              </p>
            ) : (
              <SelectField
                value={albumId}
                onChange={(e) => setAlbumId(e.target.value)}
                variant="panel"
                className="px-3 py-2 text-base"
              >
                <option value="">
                  {destination === "live" ? "Select a concert album..." : "Select an album..."}
                </option>
                {destinationAlbums.map((al) => (
                  <option key={al.id} value={al.id}>
                    {al.title}
                  </option>
                ))}
              </SelectField>
            )}
            {destination !== "single" && destinationAlbums.length === 0 && (
              <p className="text-xs text-fg-subtle -mt-1">
                {destination === "live"
                  ? "No concert albums yet — create one first from Bulk Upload Tracks."
                  : "No albums yet — create one first from Bulk Upload Tracks."}
              </p>
            )}
            <TextField
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Genre (optional)"
              variant="panel"
              className="px-3 py-2 text-base"
            />
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmRights}
              onChange={(e) => setConfirmRights(e.target.checked)}
              className="mt-0.5"
            />
            <span>I own this content or have explicit permission to download and use it.</span>
          </label>

          {submitError && (
            <p className="flex items-center gap-2 text-sm text-accent-red">
              <AlertCircle size={14} />
              {submitError}
            </p>
          )}
          {phase === "error" && job?.error && (
            <p className="flex items-center gap-2 text-sm text-accent-red">
              <AlertCircle size={14} />
              {job.error}
            </p>
          )}

          <button
            onClick={destination === "single" ? goToMetadataStep : startImport}
            disabled={submitting || previewLoading}
            className="self-start flex items-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          >
            {submitting || previewLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Clapperboard size={16} />
            )}
            {phase === "error" ? "Try again" : destination === "single" ? "Next" : "Import from YouTube"}
          </button>
        </div>
      )}

      {step === "metadata" && (phase === "idle" || phase === "error") && (
        <div className="bg-elevated rounded-lg p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-panel shrink-0 flex items-center justify-center">
              {preview?.thumbnail ? (
                <img src={preview.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Music2 size={22} className="text-fg-subtle" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Detected from video</p>
              {preview?.duration != null && (
                <p className="text-sm text-fg-muted mt-0.5">{formatDuration(preview.duration)}</p>
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-fg-muted">Song Title</span>
            <TextField
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Song title"
              variant="panel"
              className="w-full mt-1 px-3 py-2 text-base"
            />
          </label>

          <div className="relative">
            <label className="block">
              <span className="text-xs font-semibold text-fg-muted">Artist Name</span>
              <TextField
                type="text"
                value={metaArtistName}
                onChange={(e) => {
                  setMetaArtistName(e.target.value);
                  setSelectedArtistId(null);
                }}
                onFocus={() => setShowArtistSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowArtistSuggestions(false), 150)}
                placeholder="Artist name"
                variant="panel"
                className="w-full mt-1 px-3 py-2 text-base"
              />
            </label>
            {showArtistSuggestions && artistSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-panel rounded-md shadow-2xl py-1 z-10 max-h-48 overflow-y-auto">
                {artistSuggestions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMetaArtistName(a.name);
                      setSelectedArtistId(a.id);
                      setShowArtistSuggestions(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-elevated-hover transition-colors text-left"
                  >
                    <Disc3 size={13} className="text-fg-subtle shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            {typedArtistName && (
              <p className="flex items-center gap-1.5 text-xs text-fg-muted mt-1.5">
                <Sparkles size={12} className="shrink-0 text-brand" />
                {resolvedArtistId ? (
                  <span>
                    Will link to existing artist "
                    {artists.find((a) => a.id === resolvedArtistId)?.name ?? typedArtistName}"
                  </span>
                ) : (
                  <span>No matching artist — this single will show as "{typedArtistName}" without an Artist page</span>
                )}
              </p>
            )}
          </div>

          {submitError && (
            <p className="flex items-center gap-2 text-sm text-accent-red">
              <AlertCircle size={14} />
              {submitError}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setStep("form")}
              className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2.5 rounded-full hover:bg-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={reset}
              className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2.5 rounded-full hover:bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={startImport}
              disabled={submitting}
              className="ml-auto flex items-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />}
              Import
            </button>
          </div>
        </div>
      )}

      {phase === "polling" && job && (
        <div className="bg-elevated rounded-lg p-6 flex flex-col items-center gap-4 text-center">
          <Loader2 size={28} className="animate-spin text-brand" />
          <div className="w-full max-w-sm">
            <div className="h-2 rounded-full bg-panel overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${Math.max(4, job.progress)}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-fg-muted">{job.message}</p>
        </div>
      )}

      {phase === "done" && job?.track && (
        <div className="bg-elevated rounded-lg p-6 flex flex-col items-center gap-4 text-center">
          <div className="w-28 h-28">
            <CoverArt
              gradient={job.track.gradient}
              size="lg"
              photoUrl={job.track.coverUrl}
              entityType="track"
              entityId={job.track.id}
              artworkFrame={job.track.artworkFrame}
              readOnlyArtwork={Boolean(job.track.albumId)}
            />
          </div>
          <div>
            <p className="flex items-center justify-center gap-2 font-bold text-lg">
              <Check size={18} className="text-brand" />
              {job.track.title}
            </p>
            <p className="text-sm text-fg-muted mt-1">
              {job.track.artistName} · {formatDuration(job.track.duration)}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={reset}
              className="text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-full hover:bg-hover transition-colors"
            >
              Import another
            </button>
            <button
              onClick={() => navigate("/")}
              className="bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform"
            >
              Go to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
