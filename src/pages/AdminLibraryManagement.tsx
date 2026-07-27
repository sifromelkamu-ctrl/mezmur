import {
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  GitMerge,
  Loader2,
  Music2,
  Pencil,
  Plus,
  Search as SearchIcon,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import CoverArt from "../components/CoverArt";
import EditConcertModal from "../components/EditConcertModal";
import { emitArtworkChanged } from "../lib/artworkEvents";
import { isConcertAlbumItem } from "../lib/concerts";
import SelectField from "../components/form/SelectField";
import TextAreaField from "../components/form/TextAreaField";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import {
  adminApi,
  adminLibraryApi,
  albumsApi,
  artistsApi,
  concertsApi,
  singlesApi,
  type AdminTrackEditInput,
  type ApiAdminTrack,
  type ApiAlbum,
  type ApiAlbumDetail,
  type ApiArtist,
  type ApiArtistDetail,
  type ApiConcertItem,
  type ApiTrack,
} from "../lib/api";

// Everything in this file is reached only from Settings -> Admin ->
// "Library Management" (admin-role-gated there) and is enforced admin-only
// again server-side by the /api/admin/library/* routes. It intentionally
// does not touch TrackRow, Card, ArtistDetail, AlbumDetail, or any
// consumer-facing screen — this is a self-contained catalog browser/editor.

// Defined at module scope (not nested in the page component) so identity
// stays stable across re-renders and these don't get remounted every time
// the page's own state changes.

// Rendered via a portal straight onto document.body so it always escapes
// App.tsx's `.relative.z-10` route wrapper — without the portal, that
// wrapper's own z-index traps every descendant (no matter how high its own
// z-index is) below the fixed player bar/bottom nav's sibling z-30 div, which
// is what previously left the Delete button unreachable behind them.
// Centered (not bottom-docked) and independently scrollable at every screen
// size so the action buttons at the bottom of the dialog are always reachable
// even on short viewports, rather than being flush against the same screen
// edge the player bar/nav occupy.
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-elevated rounded-2xl p-5 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overscroll-y-contain shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 className="text-base font-bold mb-1.5">{title}</h3>
      <p className="text-sm text-fg-muted mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-sm font-semibold text-fg-muted hover:bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-accent-red text-white hover:brightness-110 transition-all disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

const NEW_ARTIST_OPTION = "__new_artist__";

interface EditSongModalProps {
  trackId: string;
  artists: ApiArtist[];
  albums: ApiAlbum[];
  onClose: () => void;
  onSaved: () => void;
  // Called after either creating a brand-new artist or renaming an existing
  // one — same shape either way (an ApiArtist to upsert into the parent's
  // artists list by id), so one callback covers both.
  onArtistUpserted: (artist: ApiArtist) => void;
}

function EditSongModal({ trackId, artists, albums, onClose, onSaved, onArtistUpserted }: EditSongModalProps) {
  const [track, setTrack] = useState<ApiAdminTrack | null>(null);
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [trackNumber, setTrackNumber] = useState("");
  const [discNumber, setDiscNumber] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Only meaningful while there's no album (see Track.isSingle/isConcertSong
  // in schema.prisma) — "Add to Concert Album" is just picking a concert
  // from the album dropdown below, since a Concert Album is still a regular
  // Album row.
  const [category, setCategory] = useState<"none" | "single" | "concert_song">("none");
  // Lets an admin properly name a Single that has no linked Artist yet (an
  // unmatched YouTube import — see ApiTrack.artistName's doc comment) by
  // creating a real Artist row inline, mirroring AdminUpload.tsx's pattern.
  const [creatingArtist, setCreatingArtist] = useState(false);
  const [newArtistName, setNewArtistName] = useState("");
  // Renames the artist currently assigned to this track in place, rather
  // than reassigning to a different one — for correcting a name (typo,
  // an unmatched import's raw text-derived name, etc).
  const [renamingArtist, setRenamingArtist] = useState(false);
  const [renameArtistValue, setRenameArtistValue] = useState("");

  useEffect(() => {
    adminLibraryApi.getTrack(trackId).then((t) => {
      setTrack(t);
      setTitle(t.title);
      setArtistId(t.artistId ?? "");
      setAlbumId(t.albumId ?? "");
      setTrackNumber(t.trackNumber != null ? String(t.trackNumber) : "");
      setDiscNumber(t.discNumber != null ? String(t.discNumber) : "");
      setReleaseYear(t.releaseYear != null ? String(t.releaseYear) : "");
      setGenre(t.genre ?? "");
      setLanguage(t.language ?? "");
      setLyrics(t.lyrics ?? "");
      setCategory(t.isConcertSong ? "concert_song" : t.isSingle ? "single" : "none");
    });
  }, [trackId]);

  const albumsForArtist = useMemo(() => albums.filter((a) => a.artistId === artistId), [albums, artistId]);

  const confirmNewArtist = async () => {
    const name = newArtistName.trim();
    if (!name) return;
    const artist = await adminApi.createArtist(name);
    onArtistUpserted(artist);
    setArtistId(artist.id);
    setAlbumId("");
    setCreatingArtist(false);
    setNewArtistName("");
  };

  const startRenameArtist = () => {
    setRenameArtistValue(artists.find((a) => a.id === artistId)?.name ?? "");
    setRenamingArtist(true);
  };

  const confirmRenameArtist = async () => {
    const name = renameArtistValue.trim();
    if (!name || !artistId) return;
    const artist = await artistsApi.update(artistId, { name });
    onArtistUpserted(artist);
    setRenamingArtist(false);
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!artistId) {
      setError("Artist is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input: AdminTrackEditInput = {
        title: title.trim(),
        artistId,
        albumId: albumId || null,
        trackNumber: trackNumber === "" ? null : Number(trackNumber),
        discNumber: discNumber === "" ? null : Number(discNumber),
        releaseYear: releaseYear === "" ? null : Number(releaseYear),
        genre: genre.trim(),
        language: language.trim(),
        lyrics: lyrics.trim() === "" ? null : lyrics.trim(),
        // Only sent while standalone — an album assignment above already
        // wins (adminLibrary.ts's PATCH forces these off any album
        // regardless, so this only actually matters when albumId is empty).
        ...(!albumId ? { isSingle: category === "single", isConcertSong: category === "concert_song" } : {}),
      };
      await adminLibraryApi.updateTrack(trackId, input);
      // Album Artwork Is Master Artwork: a track assigned to an album has no
      // artwork of its own to replace, so this is only ever reached for a
      // standalone single (the upload control itself is hidden otherwise).
      if (artworkFile && !albumId) {
        const { track: updatedTrack } = await adminApi.uploadCover(artworkFile, { trackId });
        emitArtworkChanged({
          entityType: "track",
          entityId: trackId,
          patch: { coverUrl: updatedTrack?.coverUrl ?? null, artworkFrame: null },
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!track) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-fg-muted" />
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-base font-bold mb-4">Edit Song</h3>
      <div className="flex flex-col gap-3">
        <TextField
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song title"
          variant="panel"
          className="px-3 py-2 text-base"
        />
        {creatingArtist ? (
          <div className="flex items-center gap-2">
            <TextField
              autoFocus
              type="text"
              value={newArtistName}
              onChange={(e) => setNewArtistName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNewArtist()}
              placeholder="New artist name"
              variant="panel"
              className="px-3 py-2 text-base flex-1"
            />
            <button
              onClick={confirmNewArtist}
              disabled={!newArtistName.trim()}
              className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
              aria-label="Create artist"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => {
                setCreatingArtist(false);
                setNewArtistName("");
              }}
              className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
              aria-label="Cancel"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : renamingArtist ? (
          <div className="flex items-center gap-2">
            <TextField
              autoFocus
              type="text"
              value={renameArtistValue}
              onChange={(e) => setRenameArtistValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmRenameArtist()}
              placeholder="Artist name"
              variant="panel"
              className="px-3 py-2 text-base flex-1"
            />
            <button
              onClick={confirmRenameArtist}
              disabled={!renameArtistValue.trim()}
              className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
              aria-label="Save artist name"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setRenamingArtist(false)}
              className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
              aria-label="Cancel"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <SelectField
              value={artistId}
              onChange={(e) => {
                const value = e.target.value;
                if (value === NEW_ARTIST_OPTION) {
                  setCreatingArtist(true);
                  return;
                }
                setArtistId(value);
                setAlbumId("");
              }}
              variant="panel"
              className="px-3 py-2 text-base flex-1"
            >
              <option value="">Select artist...</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={NEW_ARTIST_OPTION}>+ New artist...</option>
            </SelectField>
            {artistId && (
              <button
                onClick={startRenameArtist}
                className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg hover:bg-elevated-hover flex items-center justify-center"
                aria-label="Rename artist"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
        <SelectField
          value={albumId}
          onChange={(e) => {
            const next = e.target.value;
            setAlbumId(next);
            // Assigning to an album hands artwork control over to it — any
            // file already picked for a per-track upload no longer applies.
            if (next) setArtworkFile(null);
          }}
          variant="panel"
          className="px-3 py-2 text-base"
        >
          <option value="">No album</option>
          {albumsForArtist.map((al) => (
            <option key={al.id} value={al.id}>
              {al.title}
            </option>
          ))}
        </SelectField>
        {!albumId && (
          <SelectField
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            variant="panel"
            className="px-3 py-2 text-base"
          >
            <option value="none">Not categorized</option>
            <option value="single">Single</option>
            <option value="concert_song">Concert Song (standalone)</option>
          </SelectField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            type="number"
            value={trackNumber}
            onChange={(e) => setTrackNumber(e.target.value)}
            placeholder="Track #"
            variant="panel"
            className="px-3 py-2 text-base"
          />
          <TextField
            type="number"
            value={discNumber}
            onChange={(e) => setDiscNumber(e.target.value)}
            placeholder="Disc #"
            variant="panel"
            className="px-3 py-2 text-base"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            type="number"
            value={releaseYear}
            onChange={(e) => setReleaseYear(e.target.value)}
            placeholder="Release year"
            variant="panel"
            className="px-3 py-2 text-base"
          />
          <TextField
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Genre"
            variant="panel"
            className="px-3 py-2 text-base"
          />
        </div>
        <TextField
          type="text"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="Language"
          variant="panel"
          className="px-3 py-2 text-base"
        />
        <TextAreaField
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder="Lyrics (optional)"
          variant="panel"
          rows={5}
          className="px-3 py-2 text-sm"
        />
        {albumId ? (
          <p className="text-xs text-fg-muted bg-panel rounded-md px-3 py-2">
            Artwork for this song is managed by its album — edit the album's artwork instead.
          </p>
        ) : (
          <label className="flex items-center gap-2 bg-panel rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-elevated-hover transition-colors">
            <Music2 size={16} className="text-fg-subtle shrink-0" />
            <span className="truncate text-fg-muted">{artworkFile ? artworkFile.name : "Replace artwork (optional)"}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setArtworkFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-full text-sm font-semibold text-fg-muted hover:bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold bg-brand text-black hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
      </div>
    </ModalShell>
  );
}

interface MoveToAlbumModalProps {
  trackIds: string[];
  defaultArtistId?: string;
  artists: ApiArtist[];
  albums: ApiAlbum[];
  onClose: () => void;
  onMoved: (result: { movedCount: number; album: ApiAlbum }) => void;
}

type MoveStep = "artist" | "album" | "create";

function MoveToAlbumModal({ trackIds, defaultArtistId, artists, albums, onClose, onMoved }: MoveToAlbumModalProps) {
  // Artist is always chosen first — even when a default is known (moving
  // within the album the tracks came from), the admin lands one step in
  // (the destination-album picker for that artist) rather than skipping
  // artist selection entirely, and can still go back to pick someone else.
  const [step, setStep] = useState<MoveStep>(defaultArtistId ? "album" : "artist");
  const [selectedArtistId, setSelectedArtistId] = useState(defaultArtistId ?? "");
  const [artistQuery, setArtistQuery] = useState("");
  const [albumQuery, setAlbumQuery] = useState("");
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedArtist = artists.find((a) => a.id === selectedArtistId);

  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    return q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists;
  }, [artists, artistQuery]);

  const artistAlbums = useMemo(() => {
    const mine = albums.filter((a) => a.artistId === selectedArtistId);
    const q = albumQuery.trim().toLowerCase();
    return q ? mine.filter((a) => a.title.toLowerCase().includes(q)) : mine;
  }, [albums, selectedArtistId, albumQuery]);

  const chooseArtist = (id: string) => {
    setSelectedArtistId(id);
    setAlbumQuery("");
    setError("");
    setStep("album");
  };

  const moveTo = async (destinationAlbumId: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await adminLibraryApi.moveTracks(trackIds, destinationAlbumId);
      onMoved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
      setBusy(false);
    }
  };

  const createAndMove = async () => {
    const title = newAlbumTitle.trim();
    if (!title || !selectedArtistId) return;
    setBusy(true);
    setError("");
    try {
      const album = await adminApi.addAlbum(selectedArtistId, title);
      const result = await adminLibraryApi.moveTracks(trackIds, album.id);
      onMoved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-base font-bold mb-1">Move {trackIds.length > 1 ? `${trackIds.length} songs` : "song"}</h3>
      <p className="text-sm text-fg-muted mb-4">
        {step === "artist"
          ? "Choose an artist."
          : step === "album"
            ? `Choose an album by ${selectedArtist?.name ?? "this artist"}, or create a new one.`
            : `New album by ${selectedArtist?.name ?? "this artist"}.`}
      </p>

      {step === "artist" && (
        <>
          <div className="relative mb-3">
            <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <TextField
              autoFocus
              type="text"
              value={artistQuery}
              onChange={(e) => setArtistQuery(e.target.value)}
              placeholder="Search artists..."
              variant="panel"
              className="pl-9 pr-3 py-2 text-base w-full"
            />
          </div>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto overscroll-y-contain">
            {filteredArtists.map((a) => (
              <button
                key={a.id}
                onClick={() => chooseArtist(a.id)}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-hover transition-colors text-left"
              >
                <CoverArt gradient={a.gradient} size="sm" photoUrl={a.photoUrl} rounded />
                <p className="text-sm font-medium truncate flex-1">{a.name}</p>
                <ChevronRight size={16} className="text-fg-subtle shrink-0" />
              </button>
            ))}
            {filteredArtists.length === 0 && (
              <p className="text-sm text-fg-muted px-2 py-4 text-center">No artists found.</p>
            )}
          </div>
        </>
      )}

      {step === "album" && (
        <>
          <div className="relative mb-3">
            <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <TextField
              type="text"
              value={albumQuery}
              onChange={(e) => setAlbumQuery(e.target.value)}
              placeholder="Search albums..."
              variant="panel"
              className="pl-9 pr-3 py-2 text-base w-full"
            />
          </div>
          <button
            onClick={() => setStep("create")}
            className="flex items-center gap-2 w-full px-3 py-2.5 mb-2 rounded-md text-sm font-semibold text-brand hover:bg-hover transition-colors text-left"
          >
            <Plus size={16} />
            Create new album...
          </button>
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto overscroll-y-contain">
            {artistAlbums.map((al) => (
              <button
                key={al.id}
                onClick={() => moveTo(al.id)}
                disabled={busy}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-hover transition-colors text-left disabled:opacity-50"
              >
                <CoverArt
                  gradient={al.gradient}
                  size="sm"
                  photoUrl={al.coverUrl}
                  entityType="album"
                  entityId={al.id}
                  artworkFrame={al.artworkFrame}
                />
                <p className="text-sm font-medium truncate">{al.title}</p>
              </button>
            ))}
            {artistAlbums.length === 0 && (
              <p className="text-sm text-fg-muted px-2 py-4 text-center">No albums for this artist yet.</p>
            )}
          </div>
          <button
            onClick={() => setStep("artist")}
            className="mt-3 text-sm font-semibold text-fg-muted hover:text-fg transition-colors"
          >
            Change artist
          </button>
        </>
      )}

      {step === "create" && (
        <div className="flex flex-col gap-3">
          <TextField
            autoFocus
            type="text"
            value={newAlbumTitle}
            onChange={(e) => setNewAlbumTitle(e.target.value)}
            placeholder="New album title"
            variant="panel"
            className="px-3 py-2 text-base"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStep("album")}
              className="px-4 py-2 rounded-full text-sm font-semibold text-fg-muted hover:bg-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={createAndMove}
              disabled={busy || !newAlbumTitle.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-brand text-black hover:brightness-110 transition-all disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Create &amp; move
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-accent-red mt-3">{error}</p>}
    </ModalShell>
  );
}

interface MergeAlbumsModalProps {
  sourceAlbum: ApiAlbum;
  albums: ApiAlbum[];
  onClose: () => void;
  onMerged: () => void;
}

function MergeAlbumsModal({ sourceAlbum, albums, onClose, onMerged }: MergeAlbumsModalProps) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ApiAlbum | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return albums.filter((a) => {
      if (a.id === sourceAlbum.id) return false;
      if (!q) return true;
      return a.title.toLowerCase().includes(q) || (a.artistName ?? "").toLowerCase().includes(q);
    });
  }, [albums, query, sourceAlbum.id]);

  const confirmMerge = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await adminLibraryApi.mergeAlbums(sourceAlbum.id, target.id);
      onMerged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
      setBusy(false);
    }
  };

  if (target) {
    return (
      <ModalShell onClose={onClose}>
        <h3 className="text-base font-bold mb-1.5">Merge albums?</h3>
        <p className="text-sm text-fg-muted mb-5">
          All songs in <span className="text-fg font-medium">{sourceAlbum.title}</span> will move into{" "}
          <span className="text-fg font-medium">{target.title}</span>, and{" "}
          <span className="text-fg font-medium">{sourceAlbum.title}</span> will be removed. Songs are never deleted.
        </p>
        {error && <p className="text-xs text-accent-red mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setTarget(null)}
            className="px-4 py-2 rounded-full text-sm font-semibold text-fg-muted hover:bg-hover transition-colors"
          >
            Back
          </button>
          <button
            onClick={confirmMerge}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-brand text-black hover:brightness-110 transition-all disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Merge
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-base font-bold mb-1">Merge "{sourceAlbum.title}" into...</h3>
      <p className="text-sm text-fg-muted mb-4">Choose the album to merge its songs into.</p>
      <div className="relative mb-3">
        <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <TextField
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search albums..."
          variant="panel"
          className="pl-9 pr-3 py-2 text-base w-full"
        />
      </div>
      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto overscroll-y-contain">
        {filtered.map((al) => (
          <button
            key={al.id}
            onClick={() => setTarget(al)}
            className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-hover transition-colors text-left"
          >
            <CoverArt
              gradient={al.gradient}
              size="sm"
              photoUrl={al.coverUrl}
              entityType="album"
              entityId={al.id}
              artworkFrame={al.artworkFrame}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{al.title}</p>
              <p className="text-xs text-fg-muted truncate">{al.artistName}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-fg-muted px-2 py-4 text-center">No other albums found.</p>}
      </div>
    </ModalShell>
  );
}

interface EditAlbumModalProps {
  album: ApiAlbum;
  onClose: () => void;
  onSaved: () => void;
}

function EditAlbumModal({ album, onClose, onSaved }: EditAlbumModalProps) {
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const [genre, setGenre] = useState(album.genre ?? "");
  const [releaseDate, setReleaseDate] = useState(album.releaseDate ?? "");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await albumsApi.update(album.id, {
        title: title.trim(),
        description: description.trim(),
        genre: genre.trim(),
        releaseDate: releaseDate.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  // Flips this row from a regular Album to a Concert Album (same Album row,
  // just albumType — see routes/albums.ts) — it'll show up in Home's
  // Concerts section and stop appearing here/in the artist's own
  // discography from the next fetch on.
  const convertToConcert = async () => {
    setConverting(true);
    setError("");
    try {
      await albumsApi.update(album.id, { albumType: "live" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert to a Concert Album");
      setConverting(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-base font-bold mb-4">Edit Album</h3>
      <div className="flex flex-col gap-3">
        <TextField
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Album title"
          variant="panel"
          className="px-3 py-2 text-base"
        />
        <TextAreaField
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          variant="panel"
          rows={3}
          className="px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Genre"
            variant="panel"
            className="px-3 py-2 text-base"
          />
          <TextField
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            variant="panel"
            className="px-3 py-2 text-base"
          />
        </div>
        <button
          onClick={convertToConcert}
          disabled={converting}
          className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors self-start disabled:opacity-60"
        >
          <Ticket size={14} />
          {converting ? "Converting…" : "Convert to Concert Album"}
        </button>
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-full text-sm font-semibold text-fg-muted hover:bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold bg-brand text-black hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
      </div>
    </ModalShell>
  );
}

type Level = "artists" | "albums" | "tracks" | "concerts" | "singles";

export default function AdminLibraryManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [concerts, setConcerts] = useState<ApiConcertItem[]>([]);
  const [singles, setSingles] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [concertsLoading, setConcertsLoading] = useState(false);
  const [singlesLoading, setSinglesLoading] = useState(false);

  const [level, setLevel] = useState<Level>("artists");
  const [selectedArtist, setSelectedArtist] = useState<ApiArtistDetail | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<ApiAlbumDetail | null>(null);

  const [query, setQuery] = useState("");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const [editSongId, setEditSongId] = useState<string | null>(null);
  // Bundles the moving trackIds with the album they're moving *from*, so a
  // completed move can be undone by moving them straight back.
  const [moveRequest, setMoveRequest] = useState<{ trackIds: string[]; sourceAlbumId: string } | null>(null);
  const [editAlbum, setEditAlbum] = useState<ApiAlbum | null>(null);
  // A Concert Album selected for editing — reuses the same full-featured
  // EditConcertModal the Concerts page itself uses (rename/artwork/
  // reorder/add-remove tracks/convert-to-regular-album/delete), rather
  // than rebuilding any of that here.
  const [editConcert, setEditConcert] = useState<ApiAlbumDetail | null>(null);
  const [mergeSourceAlbum, setMergeSourceAlbum] = useState<ApiAlbum | null>(null);
  const [confirmDeleteTrack, setConfirmDeleteTrack] = useState<ApiTrack | null>(null);
  const [confirmDeleteAlbum, setConfirmDeleteAlbum] = useState<ApiAlbum | null>(null);
  const [confirmDeleteArtist, setConfirmDeleteArtist] = useState<ApiArtist | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastMove, setLastMove] = useState<{
    trackIds: string[];
    sourceAlbumId: string;
    destinationAlbumTitle: string;
    count: number;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const isAdmin = user?.role === "admin";

  const loadCatalog = () => {
    Promise.all([artistsApi.list(), albumsApi.list()]).then(([ar, al]) => {
      setArtists(ar);
      setAlbums(al);
    });
  };

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([artistsApi.list(), albumsApi.list()])
      .then(([ar, al]) => {
        setArtists(ar);
        setAlbums(al);
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const openArtist = async (artistId: string) => {
    const detail = await artistsApi.get(artistId);
    setSelectedArtist(detail);
    setLevel("albums");
    setQuery("");
  };

  const refreshSelectedArtist = async () => {
    if (!selectedArtist) return;
    const detail = await artistsApi.get(selectedArtist.id);
    setSelectedArtist(detail);
  };

  const openAlbum = async (albumId: string) => {
    const detail = await albumsApi.get(albumId);
    setSelectedAlbum(detail);
    setLevel("tracks");
    setQuery("");
    setSelectedTrackIds(new Set());
  };

  // Opens a Concert Album in the same full-featured EditConcertModal the
  // Concerts page itself uses — no separate tracks-drilldown view needed
  // here, that modal already covers rename/artwork/reorder/add-remove
  // tracks/convert-to-regular-album/delete.
  const openEditConcert = async (albumId: string) => {
    const detail = await albumsApi.get(albumId);
    setEditConcert(detail);
  };

  const refreshSelectedAlbum = async () => {
    if (!selectedAlbum) return;
    const detail = await albumsApi.get(selectedAlbum.id);
    setSelectedAlbum(detail);
  };

  const backToArtists = () => {
    setLevel("artists");
    setSelectedArtist(null);
    setQuery("");
    setLastMove(null);
    loadCatalog();
  };

  const refreshConcerts = () => concertsApi.list().then(setConcerts);

  const openConcerts = () => {
    setLevel("concerts");
    setQuery("");
    setConcertsLoading(true);
    refreshConcerts().finally(() => setConcertsLoading(false));
  };

  const refreshSingles = () => singlesApi.list().then(setSingles);

  const openSingles = () => {
    setLevel("singles");
    setQuery("");
    setSinglesLoading(true);
    refreshSingles().finally(() => setSinglesLoading(false));
  };

  const backToAlbums = async () => {
    setLevel("albums");
    setSelectedAlbum(null);
    setQuery("");
    setSelectedTrackIds(new Set());
    setLastMove(null);
    await refreshSelectedArtist();
  };

  const createAlbum = async () => {
    const title = newAlbumTitle.trim();
    if (!title || !selectedArtist) return;
    await adminApi.addAlbum(selectedArtist.id, title);
    setNewAlbumTitle("");
    setCreatingAlbum(false);
    await refreshSelectedArtist();
    loadCatalog();
  };

  const toggleTrack = (id: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filteredTracks.map((t) => t.id);
    const allSelected = visible.length > 0 && visible.every((id) => selectedTrackIds.has(id));
    setSelectedTrackIds(allSelected ? new Set() : new Set(visible));
  };

  const undoLastMove = async () => {
    if (!lastMove) return;
    setUndoing(true);
    try {
      await adminLibraryApi.moveTracks(lastMove.trackIds, lastMove.sourceAlbumId);
      setLastMove(null);
      await refreshSelectedAlbum();
      loadCatalog();
    } finally {
      setUndoing(false);
    }
  };

  const runDeleteTrack = async () => {
    if (!confirmDeleteTrack) return;
    setBusy(true);
    try {
      await adminLibraryApi.deleteTrack(confirmDeleteTrack.id);
      setConfirmDeleteTrack(null);
      await refreshSelectedAlbum();
      loadCatalog();
      if (level === "concerts") await refreshConcerts();
      if (level === "singles") await refreshSingles();
    } finally {
      setBusy(false);
    }
  };

  const runDeleteAlbum = async () => {
    if (!confirmDeleteAlbum) return;
    setBusy(true);
    try {
      await adminLibraryApi.deleteAlbum(confirmDeleteAlbum.id);
      setConfirmDeleteAlbum(null);
      if (selectedAlbum?.id === confirmDeleteAlbum.id) {
        setLevel("albums");
        setSelectedAlbum(null);
      }
      await refreshSelectedArtist();
      loadCatalog();
      if (level === "concerts") await refreshConcerts();
    } finally {
      setBusy(false);
    }
  };

  const runDeleteArtist = async () => {
    if (!confirmDeleteArtist) return;
    setBusy(true);
    try {
      await adminLibraryApi.deleteArtist(confirmDeleteArtist.id);
      setConfirmDeleteArtist(null);
      if (selectedArtist?.id === confirmDeleteArtist.id) {
        backToArtists();
      } else {
        loadCatalog();
      }
    } finally {
      setBusy(false);
    }
  };

  const filteredArtists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists;
  }, [artists, query]);

  const filteredAlbums = useMemo(() => {
    const list = selectedArtist?.albums ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => a.title.toLowerCase().includes(q)) : list;
  }, [selectedArtist, query]);

  const filteredConcerts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? concerts.filter((c) => c.title.toLowerCase().includes(q)) : concerts;
  }, [concerts, query]);

  const filteredSingles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? singles.filter((s) => s.title.toLowerCase().includes(q)) : singles;
  }, [singles, query]);

  const filteredTracks = useMemo(() => {
    const list = selectedAlbum?.tracks ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((t) => t.title.toLowerCase().includes(q)) : list;
  }, [selectedAlbum, query]);

  if (!isAdmin) {
    return (
      <div className="px-6 py-10 max-w-lg">
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const headerBack =
    level === "tracks"
      ? backToAlbums
      : level === "albums" || level === "concerts" || level === "singles"
        ? backToArtists
        : () => navigate("/settings");
  const headerTitle =
    level === "tracks"
      ? selectedAlbum?.title ?? ""
      : level === "albums"
        ? selectedArtist?.name ?? ""
        : level === "concerts"
          ? "Concerts"
          : level === "singles"
            ? "Singles"
            : "Library Management";
  const headerSubtitle =
    level === "tracks"
      ? selectedTrackIds.size > 0
        ? `${selectedTrackIds.size} selected`
        : "Songs"
      : level === "albums"
        ? "Albums"
        : level === "concerts"
          ? "Concert Albums & Songs"
          : level === "singles"
            ? "Standalone Singles"
            : "Browse artists, albums, and songs";
  const allVisibleSelected =
    filteredTracks.length > 0 && filteredTracks.every((t) => selectedTrackIds.has(t.id));

  return (
    <div className="px-6 py-6 max-w-3xl pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={headerBack}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5 shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{headerTitle}</h1>
          <p className="text-sm text-fg-muted mt-0.5">{headerSubtitle}</p>
        </div>
      </div>

      <div className="relative mb-5">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <TextField
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            level === "artists"
              ? "Search artists..."
              : level === "albums"
                ? "Search albums..."
                : level === "concerts"
                  ? "Search concerts..."
                  : "Search songs..."
          }
          pill
          className="pl-9 pr-4 py-2 text-base w-full"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-fg-muted" />
        </div>
      )}

      {!loading && level === "artists" && (
        <div className="flex flex-col gap-1">
          <button
            onClick={openConcerts}
            className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-hover transition-colors text-left mb-2"
          >
            <span className="w-9 h-9 shrink-0 rounded-full bg-brand/15 flex items-center justify-center text-brand">
              <Ticket size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Concerts</p>
              <p className="text-xs text-fg-muted truncate">Manage Concert Albums &amp; standalone Concert Songs</p>
            </div>
            <ChevronRight size={16} className="text-fg-subtle shrink-0" />
          </button>
          <button
            onClick={openSingles}
            className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-hover transition-colors text-left mb-2"
          >
            <span className="w-9 h-9 shrink-0 rounded-full bg-brand/15 flex items-center justify-center text-brand">
              <Disc3 size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Singles</p>
              <p className="text-xs text-fg-muted truncate">Manage standalone Singles &amp; their artist name</p>
            </div>
            <ChevronRight size={16} className="text-fg-subtle shrink-0" />
          </button>
          {filteredArtists.map((artist) => (
            <div key={artist.id} className="flex items-center gap-1 rounded-md hover:bg-hover transition-colors group">
              <button
                onClick={() => openArtist(artist.id)}
                className="flex items-center gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
              >
                <CoverArt gradient={artist.gradient} size="sm" photoUrl={artist.photoUrl} rounded />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{artist.name}</p>
                  <p className="text-xs text-fg-muted truncate">
                    {artist.monthlyListeners.toLocaleString()} monthly listeners
                  </p>
                </div>
              </button>
              <ChevronRight size={16} className="text-fg-subtle shrink-0" />
              <button
                onClick={() => setConfirmDeleteArtist(artist)}
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors mr-1"
                aria-label={`Delete ${artist.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filteredArtists.length === 0 && <p className="text-sm text-fg-muted px-2 py-8 text-center">No artists found.</p>}
        </div>
      )}

      {!loading && level === "albums" && selectedArtist && (
        <>
          <div className="mb-3">
            {creatingAlbum ? (
              <div className="flex items-center gap-2">
                <TextField
                  autoFocus
                  type="text"
                  value={newAlbumTitle}
                  onChange={(e) => setNewAlbumTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createAlbum()}
                  placeholder="New album title"
                  variant="panel"
                  className="px-3 py-2 text-base flex-1"
                />
                <button
                  onClick={createAlbum}
                  disabled={!newAlbumTitle.trim()}
                  className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                  aria-label="Create album"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => {
                    setCreatingAlbum(false);
                    setNewAlbumTitle("");
                  }}
                  className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                  aria-label="Cancel"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingAlbum(true)}
                className="flex items-center gap-2 text-sm font-semibold text-brand hover:bg-hover px-2 py-2 rounded-md transition-colors"
              >
                <Plus size={16} />
                New album
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {filteredAlbums.map((album) => (
              <div key={album.id} className="flex items-center gap-1 rounded-md hover:bg-hover transition-colors group">
                <button
                  onClick={() => openAlbum(album.id)}
                  className="flex items-center gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
                >
                  <CoverArt
                    gradient={album.gradient}
                    size="sm"
                    photoUrl={album.coverUrl}
                    entityType="album"
                    entityId={album.id}
                    artworkFrame={album.artworkFrame}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{album.title}</p>
                    <p className="text-xs text-fg-muted truncate">
                      {album.trackCount ?? 0} songs{album.year ? ` · ${album.year}` : ""}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setEditAlbum(album)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                  aria-label={`Edit ${album.title}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setMergeSourceAlbum(album)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                  aria-label={`Merge ${album.title}`}
                >
                  <GitMerge size={14} />
                </button>
                <button
                  onClick={() => setConfirmDeleteAlbum(album)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors mr-1"
                  aria-label={`Delete ${album.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {filteredAlbums.length === 0 && (
              <p className="text-sm text-fg-muted px-2 py-8 text-center">No albums found.</p>
            )}
          </div>
        </>
      )}

      {!loading && level === "tracks" && selectedAlbum && (
        <>
          {lastMove && (
            <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg bg-brand/10 border border-brand/25">
              <p className="text-sm text-fg">
                ✓ {lastMove.count} song{lastMove.count > 1 ? "s" : ""} moved to "{lastMove.destinationAlbumTitle}".
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={undoLastMove}
                  disabled={undoing}
                  className="text-sm font-semibold text-brand hover:underline disabled:opacity-50"
                >
                  {undoing ? "Undoing…" : "Undo"}
                </button>
                <button
                  onClick={() => setLastMove(null)}
                  className="text-fg-muted hover:text-fg transition-colors"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {filteredTracks.length > 0 && (
            <div className="flex items-center justify-between mb-2 px-1">
              <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer select-none">
                <span
                  onClick={toggleSelectAll}
                  className={`w-5 h-5 shrink-0 rounded flex items-center justify-center border transition-colors ${
                    allVisibleSelected ? "bg-brand border-brand" : "border-fg-subtle"
                  }`}
                >
                  {allVisibleSelected && <span className="w-2 h-2 rounded-sm bg-black" />}
                </span>
                <span onClick={toggleSelectAll}>Select all</span>
              </label>
              <button
                onClick={() => setMoveRequest({ trackIds: Array.from(selectedTrackIds), sourceAlbumId: selectedAlbum.id })}
                disabled={selectedTrackIds.size === 0}
                className="flex items-center gap-2 bg-brand text-black text-sm font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                Move Selected
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1">
          {filteredTracks.map((track, i) => (
            <div
              key={track.id}
              className={`flex items-center gap-2 px-2 py-2 rounded-md transition-colors ${
                selectedTrackIds.has(track.id) ? "bg-hover" : "hover:bg-hover"
              }`}
            >
              <button
                onClick={() => toggleTrack(track.id)}
                className={`w-5 h-5 shrink-0 rounded flex items-center justify-center border transition-colors ${
                  selectedTrackIds.has(track.id) ? "bg-brand border-brand" : "border-fg-subtle"
                }`}
                aria-label={`Select ${track.title}`}
              >
                {selectedTrackIds.has(track.id) && <span className="w-2 h-2 rounded-sm bg-black" />}
              </button>
              <span className="text-xs text-fg-muted w-5 text-center shrink-0">{track.trackNumber ?? i + 1}</span>
              <p className="text-sm truncate flex-1 min-w-0">{track.title}</p>
              <button
                onClick={() => setEditSongId(track.id)}
                className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                aria-label={`Edit ${track.title}`}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() =>
                  setMoveRequest(selectedAlbum ? { trackIds: [track.id], sourceAlbumId: selectedAlbum.id } : null)
                }
                className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                aria-label={`Move ${track.title}`}
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setConfirmDeleteTrack(track)}
                className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors"
                aria-label={`Delete ${track.title}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {filteredTracks.length === 0 && (
            <p className="text-sm text-fg-muted px-2 py-8 text-center">No songs found.</p>
          )}
          </div>
        </>
      )}

      {concertsLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-fg-muted" />
        </div>
      )}

      {!concertsLoading && level === "concerts" && (
        <div className="flex flex-col gap-1">
          {filteredConcerts.map((item) =>
            isConcertAlbumItem(item) ? (
              <div key={item.id} className="flex items-center gap-1 rounded-md hover:bg-hover transition-colors group">
                <button
                  onClick={() => openEditConcert(item.id)}
                  className="flex items-center gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
                >
                  <CoverArt
                    gradient={item.gradient}
                    size="sm"
                    photoUrl={item.coverUrl}
                    entityType="album"
                    entityId={item.id}
                    artworkFrame={item.artworkFrame}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-fg-muted truncate">
                      {item.artistName ? `${item.artistName} · ` : ""}
                      {item.trackCount ?? 0} songs · Concert Album
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => openEditConcert(item.id)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                  aria-label={`Edit ${item.title}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirmDeleteAlbum(item)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors mr-1"
                  aria-label={`Delete ${item.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div key={item.id} className="flex items-center gap-1 rounded-md hover:bg-hover transition-colors group">
                <button
                  onClick={() => setEditSongId(item.id)}
                  className="flex items-center gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
                >
                  <CoverArt
                    gradient={item.gradient}
                    size="sm"
                    photoUrl={item.coverUrl}
                    entityType="track"
                    entityId={item.id}
                    artworkFrame={item.artworkFrame}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-fg-muted truncate">
                      {item.artistName ? `${item.artistName} · ` : ""}Concert Song
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setEditSongId(item.id)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                  aria-label={`Edit ${item.title}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirmDeleteTrack(item)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors mr-1"
                  aria-label={`Delete ${item.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          )}
          {filteredConcerts.length === 0 && (
            <p className="text-sm text-fg-muted px-2 py-8 text-center">No concerts found.</p>
          )}
        </div>
      )}

      {singlesLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-fg-muted" />
        </div>
      )}

      {!singlesLoading && level === "singles" && (
        <div className="flex flex-col gap-1">
          {filteredSingles.map((track) => (
            <div key={track.id} className="flex items-center gap-1 rounded-md hover:bg-hover transition-colors group">
              <button
                onClick={() => setEditSongId(track.id)}
                className="flex items-center gap-3 px-2 py-2.5 flex-1 min-w-0 text-left"
              >
                <CoverArt
                  gradient={track.gradient}
                  size="sm"
                  photoUrl={track.coverUrl}
                  entityType="track"
                  entityId={track.id}
                  artworkFrame={track.artworkFrame}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-fg-muted truncate">
                    {track.artistName ? track.artistName : "No artist"} · Single
                  </p>
                </div>
              </button>
              <button
                onClick={() => setEditSongId(track.id)}
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-elevated-hover transition-colors"
                aria-label={`Edit ${track.title}`}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setConfirmDeleteTrack(track)}
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-accent-red hover:bg-elevated-hover transition-colors mr-1"
                aria-label={`Delete ${track.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filteredSingles.length === 0 && (
            <p className="text-sm text-fg-muted px-2 py-8 text-center">No singles found.</p>
          )}
        </div>
      )}

      {editSongId && (
        <EditSongModal
          trackId={editSongId}
          artists={artists}
          albums={albums}
          onClose={() => setEditSongId(null)}
          onSaved={async () => {
            setEditSongId(null);
            await refreshSelectedAlbum();
            loadCatalog();
            if (level === "concerts") await refreshConcerts();
            if (level === "singles") await refreshSingles();
          }}
          onArtistUpserted={(artist) => {
            setArtists((prev) => {
              const exists = prev.some((a) => a.id === artist.id);
              const next = exists ? prev.map((a) => (a.id === artist.id ? artist : a)) : [...prev, artist];
              return next.sort((a, b) => a.name.localeCompare(b.name));
            });
            if (level === "concerts") refreshConcerts();
            if (level === "singles") refreshSingles();
          }}
        />
      )}

      {moveRequest && (
        <MoveToAlbumModal
          trackIds={moveRequest.trackIds}
          defaultArtistId={selectedArtist?.id}
          artists={artists}
          albums={albums}
          onClose={() => setMoveRequest(null)}
          onMoved={async (result) => {
            setLastMove({
              trackIds: moveRequest.trackIds,
              sourceAlbumId: moveRequest.sourceAlbumId,
              destinationAlbumTitle: result.album.title,
              count: result.movedCount,
            });
            setMoveRequest(null);
            setSelectedTrackIds(new Set());
            await refreshSelectedAlbum();
            loadCatalog();
          }}
        />
      )}

      {editAlbum && (
        <EditAlbumModal
          album={editAlbum}
          onClose={() => setEditAlbum(null)}
          onSaved={async () => {
            setEditAlbum(null);
            await refreshSelectedArtist();
            loadCatalog();
          }}
        />
      )}

      {mergeSourceAlbum && (
        <MergeAlbumsModal
          sourceAlbum={mergeSourceAlbum}
          albums={albums}
          onClose={() => setMergeSourceAlbum(null)}
          onMerged={async () => {
            setMergeSourceAlbum(null);
            await refreshSelectedArtist();
            loadCatalog();
          }}
        />
      )}

      {editConcert && (
        <EditConcertModal
          concert={editConcert}
          onClose={() => setEditConcert(null)}
          onSaved={async (updated) => {
            setEditConcert(updated);
            await refreshConcerts();
          }}
          onDeleted={() => {
            setEditConcert(null);
            refreshConcerts();
          }}
          onConvertedToAlbum={() => {
            setEditConcert(null);
            refreshConcerts();
            loadCatalog();
          }}
        />
      )}

      {confirmDeleteTrack && (
        <ConfirmDialog
          title="Delete this song?"
          message={`"${confirmDeleteTrack.title}" will be removed from the catalog. This can't be undone.`}
          busy={busy}
          onConfirm={runDeleteTrack}
          onCancel={() => setConfirmDeleteTrack(null)}
        />
      )}

      {confirmDeleteAlbum && (
        <ConfirmDialog
          title="Delete this album?"
          message={`"${confirmDeleteAlbum.title}" and ${
            confirmDeleteAlbum.trackCount ? `all ${confirmDeleteAlbum.trackCount} of its songs` : "all of its songs"
          } will be permanently deleted. This can't be undone.`}
          busy={busy}
          onConfirm={runDeleteAlbum}
          onCancel={() => setConfirmDeleteAlbum(null)}
        />
      )}

      {confirmDeleteArtist && (
        <ConfirmDialog
          title="Delete this artist?"
          message={`"${confirmDeleteArtist.name}" and ALL of their albums and songs will be permanently deleted, including from any playlists that include them. This can't be undone.`}
          busy={busy}
          onConfirm={runDeleteArtist}
          onCancel={() => setConfirmDeleteArtist(null)}
        />
      )}
    </div>
  );
}
