import { AlertCircle, Check, ChevronLeft, FolderUp, Loader2, Music2, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { ApiError, adminApi, albumsApi, artistsApi, type ApiAlbum, type ApiAlbumType, type ApiArtist } from "../lib/api";

type RowStatus = "idle" | "reading" | "uploading" | "done" | "error";

interface UploadRow {
  id: string;
  title: string;
  artistId: string;
  albumId: string;
  genre: string;
  file: File | null;
  duration: number | null;
  status: RowStatus;
  error?: string;
  newArtistName: string;
  newAlbumTitle: string;
  // Chosen once, at creation time, for a brand-new album container — this is
  // the "Album / Single / Concert Album" choice. Editing it later still
  // works the normal way, via the album's own detail page.
  newAlbumType: ApiAlbumType;
  creatingArtist: boolean;
  creatingAlbum: boolean;
  // Only meaningful alongside albumId — set by the "Upload Album Folder"
  // picker from each file's leading track-number prefix (see
  // parseAlbumFolderFile below) so order survives without a manual reorder
  // pass. Manually-added rows just leave this unset.
  trackNumber: number | null;
}

const NEW_OPTION = "__new__";

// Deliberately a narrower set than the full ApiAlbumType enum (which also has
// "ep" and "compilation") — those stay editable later from the album's own
// detail page; this quick-create picker only needs to answer the question
// this screen actually asks: is this release an Album, a Single, or a
// Concert Album (see Home's dedicated Concerts section)?
const NEW_ALBUM_TYPE_OPTIONS: { value: ApiAlbumType; label: string }[] = [
  { value: "album", label: "Album" },
  { value: "single", label: "Single" },
  { value: "live", label: "Concert Album" },
];

function newRow(): UploadRow {
  return {
    id: crypto.randomUUID(),
    title: "",
    artistId: "",
    albumId: "",
    genre: "",
    file: null,
    duration: null,
    status: "idle",
    newArtistName: "",
    newAlbumTitle: "",
    newAlbumType: "album",
    creatingArtist: false,
    creatingAlbum: false,
    trackNumber: null,
  };
}

// Strips a leading track-number prefix ("01 - ", "01.", "3_", "track 4 ")
// and the file extension, so "03 - Amazing Grace.mp3" becomes track number
// 3 and title "Amazing Grace". Falls back to the bare filename (still
// extension-stripped) as the title when no track number pattern matches,
// and to null (not "unknown") when there's genuinely no leading number, so
// callers can tell "no number found" apart from "found number 0".
function parseAlbumFolderFilename(filename: string): { trackNumber: number | null; title: string } {
  const withoutExt = filename.replace(/\.[a-zA-Z0-9]{1,5}$/, "");
  const match = withoutExt.match(/^\s*(?:track\s*)?(\d{1,3})\s*[-._)]*\s+(.+)$/i);
  if (match) {
    return { trackNumber: Number(match[1]), title: match[2].trim() };
  }
  return { trackNumber: null, title: withoutExt.trim() };
}

// Natural sort so "2 - ..." sorts before "10 - ..." — a plain string sort
// would put track 10 right after track 1.
function naturalFileNameCompare(a: File, b: File): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.addEventListener("loadedmetadata", () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(audio.duration));
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio file"));
    });
    audio.src = url;
  });
}

export default function AdminUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [rows, setRows] = useState<UploadRow[]>([newRow()]);
  const [uploadingAll, setUploadingAll] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // webkitdirectory isn't in React's DOM typings, and — critically — it
    // must be set as an actual DOM property, not a JSX/HTML attribute, or
    // some browsers silently ignore it and fall back to a normal (single- or
    // multi-file) picker instead of directory mode. Set once on mount via a
    // stable ref (an inline callback ref would get a new identity every
    // render, causing React to detach/reattach it repeatedly).
    if (folderInputRef.current) (folderInputRef.current as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
  }, []);

  // "Upload Album Folder" — a whole folder of audio files, resolved to one
  // shared artist+album, becomes N pre-filled rows in one action instead of
  // adding each track by hand. This state exists only between picking the
  // folder and confirming the artist/album target; once confirmed it's
  // cleared and everything downstream is just normal rows.
  const [folderFiles, setFolderFiles] = useState<File[] | null>(null);
  const [folderArtistId, setFolderArtistId] = useState("");
  const [folderCreatingArtist, setFolderCreatingArtist] = useState(false);
  const [folderNewArtistName, setFolderNewArtistName] = useState("");
  const [folderAlbumId, setFolderAlbumId] = useState("");
  const [folderCreatingAlbum, setFolderCreatingAlbum] = useState(false);
  const [folderNewAlbumTitle, setFolderNewAlbumTitle] = useState("");
  const [folderNewAlbumType, setFolderNewAlbumType] = useState<ApiAlbumType>("album");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  useEffect(() => {
    artistsApi.list().then(setArtists);
    albumsApi.list().then(setAlbums);
  }, []);

  const updateRow = (id: string, patch: Partial<UploadRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleArtistSelect = (rowId: string, value: string) => {
    if (value === NEW_OPTION) {
      updateRow(rowId, { creatingArtist: true, artistId: "", albumId: "" });
    } else {
      updateRow(rowId, { artistId: value, albumId: "", creatingArtist: false });
    }
  };

  const confirmNewArtist = async (row: UploadRow) => {
    const name = row.newArtistName.trim();
    if (!name) return;
    try {
      const artist = await adminApi.createArtist(name);
      setArtists((prev) => [...prev, artist].sort((a, b) => a.name.localeCompare(b.name)));
      updateRow(row.id, { artistId: artist.id, creatingArtist: false, newArtistName: "" });
    } catch (err) {
      // The server hard-blocks an exact-normalized-name duplicate (see
      // admin.ts's POST /artists) — surface its message so the admin can
      // pick the existing artist from the list instead of retrying blindly.
      updateRow(row.id, { error: err instanceof ApiError ? err.message : "Could not create artist" });
    }
  };

  const handleAlbumSelect = (rowId: string, value: string) => {
    if (value === NEW_OPTION) {
      updateRow(rowId, { creatingAlbum: true, albumId: "" });
    } else {
      updateRow(rowId, { albumId: value, creatingAlbum: false });
    }
  };

  const confirmNewAlbum = async (row: UploadRow) => {
    const title = row.newAlbumTitle.trim();
    if (!title || !row.artistId) return;
    try {
      const album = await adminApi.addAlbum(row.artistId, title, row.newAlbumType);
      setAlbums((prev) => [...prev, album]);
      updateRow(row.id, { albumId: album.id, creatingAlbum: false, newAlbumTitle: "", newAlbumType: "album" });
    } catch (err) {
      // See confirmNewArtist above — same exact+fuzzy duplicate-title guard,
      // scoped to this one artist (admin.ts's POST /artists/:id/albums).
      updateRow(row.id, { error: err instanceof ApiError ? err.message : "Could not create album" });
    }
  };

  const handleFilePick = async (id: string, file: File | null) => {
    if (!file) {
      updateRow(id, { file: null, duration: null });
      return;
    }
    updateRow(id, { file, status: "reading" });
    try {
      const duration = await readAudioDuration(file);
      updateRow(id, { duration, status: "idle" });
    } catch {
      updateRow(id, { duration: null, status: "error", error: "Could not read audio duration" });
    }
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleFolderPick = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const audioFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|flac|aac|ogg)$/i.test(f.name))
      .sort(naturalFileNameCompare);
    if (audioFiles.length === 0) {
      setFolderError("That folder didn't have any audio files in it.");
      return;
    }
    setFolderFiles(audioFiles);
    setFolderError(null);
    // Reset any previous in-progress target so a second folder pick starts
    // clean rather than inheriting the last folder's artist/album choice.
    setFolderArtistId("");
    setFolderCreatingArtist(false);
    setFolderNewArtistName("");
    setFolderAlbumId("");
    setFolderCreatingAlbum(false);
    setFolderNewAlbumTitle("");
    setFolderNewAlbumType("album");
  };

  const confirmFolderNewArtist = async () => {
    const name = folderNewArtistName.trim();
    if (!name) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      const artist = await adminApi.createArtist(name);
      setArtists((prev) => [...prev, artist].sort((a, b) => a.name.localeCompare(b.name)));
      setFolderArtistId(artist.id);
      setFolderCreatingArtist(false);
      setFolderNewArtistName("");
    } catch (err) {
      setFolderError(err instanceof ApiError ? err.message : "Could not create artist");
    } finally {
      setFolderBusy(false);
    }
  };

  const confirmFolderNewAlbum = async () => {
    const title = folderNewAlbumTitle.trim();
    if (!title || !folderArtistId) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      const album = await adminApi.addAlbum(folderArtistId, title, folderNewAlbumType);
      setAlbums((prev) => [...prev, album]);
      setFolderAlbumId(album.id);
      setFolderCreatingAlbum(false);
      setFolderNewAlbumTitle("");
    } catch (err) {
      setFolderError(err instanceof ApiError ? err.message : "Could not create album");
    } finally {
      setFolderBusy(false);
    }
  };

  // Turns the picked folder into N pre-filled rows once the admin has
  // confirmed (or created) a single shared artist+album for all of them —
  // reads each file's duration up front too, same as picking a file by hand
  // does one at a time, just batched here.
  const addTracksFromFolder = async () => {
    if (!folderFiles || !folderArtistId || !folderAlbumId) return;
    setFolderBusy(true);
    const built = await Promise.all(
      folderFiles.map(async (file) => {
        const { trackNumber, title } = parseAlbumFolderFilename(file.name);
        const row = newRow();
        row.title = title;
        row.artistId = folderArtistId;
        row.albumId = folderAlbumId;
        row.trackNumber = trackNumber;
        row.file = file;
        try {
          row.duration = await readAudioDuration(file);
        } catch {
          row.status = "error";
          row.error = "Could not read audio duration";
        }
        return row;
      })
    );
    setRows((prev) => (prev.length === 1 && !prev[0].title && !prev[0].file && !prev[0].artistId ? built : [...prev, ...built]));
    setFolderFiles(null);
    setFolderBusy(false);
  };

  const uploadRow = async (row: UploadRow) => {
    if (!row.title.trim() || !row.artistId || !row.file || !row.duration) {
      updateRow(row.id, { status: "error", error: "Title, artist, and audio file are required" });
      return;
    }
    updateRow(row.id, { status: "uploading", error: undefined });
    try {
      const ext = row.file.name.includes(".") ? row.file.name.split(".").pop() : undefined;
      const { upload } = await adminApi.uploadTrack({
        title: row.title.trim(),
        artistId: row.artistId,
        albumId: row.albumId || undefined,
        genre: row.genre.trim() || undefined,
        duration: row.duration,
        fileExt: ext,
        trackNumber: row.albumId && row.trackNumber ? row.trackNumber : undefined,
        // The album dropdown's own "No album (single)" option already
        // promises this — it just didn't actually tag the track as one
        // before, so it never showed up under the artist's Single Releases.
        isSingle: !row.albumId,
      });
      await adminApi.putAudioFile(upload.signedUrl, row.file);
      updateRow(row.id, { status: "done" });
    } catch (err) {
      updateRow(row.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  const uploadAll = async () => {
    setUploadingAll(true);
    // Concurrent, not sequential — each row is an independent signed-URL +
    // direct-to-Supabase-Storage upload (see uploadRow), so there's no
    // shared resource one row waiting on another would protect; a whole
    // album's worth of tracks uploads in parallel instead of one at a time.
    await Promise.all(rows.map((row) => (row.status !== "done" ? uploadRow(row) : Promise.resolve())));
    setUploadingAll(false);
  };

  const removeGroup = (ids: string[]) => {
    setRows((prev) => {
      const next = prev.filter((r) => !ids.includes(r.id));
      return next.length > 0 ? next : [newRow()];
    });
  };

  // You can click "Upload Album Folder" as many times as you want — each
  // confirmed folder appends its rows rather than replacing what's already
  // there (see addTracksFromFolder). Grouping by album here is what makes
  // that actually usable once you've queued up more than one: without it,
  // several albums' worth of tracks would just be one undifferentiated wall
  // of rows with no way to tell which track belongs to which album, or to
  // remove/review one album at a time. A row with no album (a manually
  // added single) gets its own key so it renders standalone, ungrouped,
  // exactly as before — only real multi-track album batches get a header.
  const rowGroups = useMemo(() => {
    const byKey = new Map<string, UploadRow[]>();
    const order: string[] = [];
    for (const row of rows) {
      const key = row.albumId ? `album:${row.albumId}` : `standalone:${row.id}`;
      if (!byKey.has(key)) {
        byKey.set(key, []);
        order.push(key);
      }
      byKey.get(key)!.push(row);
    }
    return order.map((key) => ({ key, rows: byKey.get(key)! }));
  }, [rows]);

  if (user?.role !== "admin") {
    return (
      <div className="relative px-6 py-10 max-w-lg">
        <BackButton />
        <p className="text-fg-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const allDone = rows.length > 0 && rows.every((r) => r.status === "done");

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back to Home"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Bulk Upload Tracks</h1>
          <p className="text-sm text-fg-muted mt-1">
            Add several tracks at once. Provide the real audio file you have rights to for each row.
          </p>
        </div>
      </div>

      <button
        onClick={() => folderInputRef.current?.click()}
        className="flex items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2.5 mb-4 rounded-lg bg-elevated hover:bg-elevated-hover transition-colors w-full justify-center"
      >
        <FolderUp size={16} />
        Upload Album Folder
      </button>
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // No accept="audio/*" here on purpose — combined with webkitdirectory
        // that's a known conflict in some browsers (the file-type filter
        // fights the "pick a whole directory" mode, and can make it fall
        // back to single-file selection). Non-audio files in the picked
        // folder are filtered out in JS instead, by handleFolderPick.
        onChange={(e) => {
          handleFolderPick(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />

      {folderFiles && (
        <div className="bg-elevated rounded-lg p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {folderFiles.length} audio file{folderFiles.length === 1 ? "" : "s"} found — choose where they go
            </p>
            <button
              onClick={() => setFolderFiles(null)}
              className="text-fg-subtle hover:text-accent-red transition-colors"
              aria-label="Cancel folder upload"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {folderCreatingArtist ? (
            <div className="flex items-center gap-2">
              <TextField
                autoFocus
                type="text"
                value={folderNewArtistName}
                onChange={(e) => setFolderNewArtistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmFolderNewArtist()}
                placeholder="New artist name"
                variant="panel"
                className="px-3 py-2 text-base flex-1"
              />
              <button
                onClick={confirmFolderNewArtist}
                disabled={!folderNewArtistName.trim() || folderBusy}
                className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                aria-label="Create artist"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => {
                  setFolderCreatingArtist(false);
                  setFolderNewArtistName("");
                }}
                className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                aria-label="Cancel"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <SelectField
              value={folderArtistId}
              onChange={(e) => {
                const value = e.target.value;
                if (value === NEW_OPTION) {
                  setFolderCreatingArtist(true);
                  setFolderArtistId("");
                  setFolderAlbumId("");
                } else {
                  setFolderArtistId(value);
                  setFolderAlbumId("");
                }
              }}
              variant="panel"
              className="px-3 py-2 text-base"
            >
              <option value="">Select artist...</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value={NEW_OPTION}>+ New artist...</option>
            </SelectField>
          )}

          {folderCreatingAlbum ? (
            <div className="flex flex-col gap-2">
              <SelectField
                value={folderNewAlbumType}
                onChange={(e) => setFolderNewAlbumType(e.target.value as ApiAlbumType)}
                variant="panel"
                className="px-3 py-2 text-base"
                aria-label="Release type"
              >
                {NEW_ALBUM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-center gap-2">
                <TextField
                  autoFocus
                  type="text"
                  value={folderNewAlbumTitle}
                  onChange={(e) => setFolderNewAlbumTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmFolderNewAlbum()}
                  placeholder="New album title"
                  variant="panel"
                  className="px-3 py-2 text-base flex-1"
                />
                <button
                  onClick={confirmFolderNewAlbum}
                  disabled={!folderNewAlbumTitle.trim() || folderBusy}
                  className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                  aria-label="Create album"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => {
                    setFolderCreatingAlbum(false);
                    setFolderNewAlbumTitle("");
                    setFolderNewAlbumType("album");
                  }}
                  className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                  aria-label="Cancel"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <SelectField
              value={folderAlbumId}
              onChange={(e) => {
                const value = e.target.value;
                if (value === NEW_OPTION) {
                  setFolderCreatingAlbum(true);
                  setFolderAlbumId("");
                } else {
                  setFolderAlbumId(value);
                }
              }}
              disabled={!folderArtistId}
              variant="panel"
              className="px-3 py-2 text-base"
            >
              <option value="">Select album...</option>
              {albums
                .filter((al) => al.artistId === folderArtistId)
                .map((al) => (
                  <option key={al.id} value={al.id}>
                    {al.title}
                  </option>
                ))}
              {folderArtistId && <option value={NEW_OPTION}>+ New album...</option>}
            </SelectField>
          )}

          {folderError && <p className="text-xs text-accent-red">{folderError}</p>}

          <button
            onClick={addTracksFromFolder}
            disabled={!folderArtistId || !folderAlbumId || folderBusy}
            className="flex items-center justify-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          >
            {folderBusy ? <Loader2 size={16} className="animate-spin" /> : <FolderUp size={16} />}
            Add {folderFiles.length} track{folderFiles.length === 1 ? "" : "s"} to this album
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {rowGroups.map((group) => (
          <div key={group.key} className="flex flex-col gap-4">
            {group.rows.length > 1 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold">
                  {artists.find((a) => a.id === group.rows[0].artistId)?.name ?? "Unknown artist"}
                  <span className="text-fg-muted font-normal"> — </span>
                  {albums.find((al) => al.id === group.rows[0].albumId)?.title ?? "Album"}
                  <span className="ml-2 text-xs font-normal text-fg-muted">({group.rows.length} tracks)</span>
                </p>
                <button
                  onClick={() => removeGroup(group.rows.map((r) => r.id))}
                  className="text-xs font-semibold text-fg-subtle hover:text-accent-red transition-colors"
                >
                  Remove album
                </button>
              </div>
            )}
            {group.rows.map((row, idx) => (
          <div key={row.id} className="bg-elevated rounded-lg p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-fg-muted uppercase tracking-wide">Track {idx + 1}</span>
              <div className="flex items-center gap-2">
                {row.status === "uploading" && <Loader2 size={16} className="animate-spin text-brand" />}
                {row.status === "done" && <Check size={16} className="text-brand" />}
                {row.status === "error" && <AlertCircle size={16} className="text-accent-red" />}
                <button
                  onClick={() => removeRow(row.id)}
                  className="text-fg-subtle hover:text-accent-red transition-colors"
                  aria-label="Remove track"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <TextField
                type="text"
                value={row.title}
                onChange={(e) => updateRow(row.id, { title: e.target.value })}
                placeholder="Track title"
                variant="panel"
                className="px-3 py-2 text-base"
              />
              {row.creatingArtist ? (
                <div className="flex items-center gap-2">
                  <TextField
                    autoFocus
                    type="text"
                    value={row.newArtistName}
                    onChange={(e) => updateRow(row.id, { newArtistName: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && confirmNewArtist(row)}
                    placeholder="New artist name"
                    variant="panel"
                    className="px-3 py-2 text-base flex-1"
                  />
                  <button
                    onClick={() => confirmNewArtist(row)}
                    disabled={!row.newArtistName.trim()}
                    className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                    aria-label="Create artist"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => updateRow(row.id, { creatingArtist: false, newArtistName: "" })}
                    className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                    aria-label="Cancel"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <SelectField
                  value={row.artistId}
                  onChange={(e) => handleArtistSelect(row.id, e.target.value)}
                  variant="panel"
                  className="px-3 py-2 text-base"
                >
                  <option value="">Select artist...</option>
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value={NEW_OPTION}>+ New artist...</option>
                </SelectField>
              )}

              {row.creatingAlbum ? (
                <div className="flex flex-col gap-2">
                  <SelectField
                    value={row.newAlbumType}
                    onChange={(e) => updateRow(row.id, { newAlbumType: e.target.value as ApiAlbumType })}
                    variant="panel"
                    className="px-3 py-2 text-base"
                    aria-label="Release type"
                  >
                    {NEW_ALBUM_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </SelectField>
                  <div className="flex items-center gap-2">
                    <TextField
                      autoFocus
                      type="text"
                      value={row.newAlbumTitle}
                      onChange={(e) => updateRow(row.id, { newAlbumTitle: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && confirmNewAlbum(row)}
                      placeholder="New album title"
                      variant="panel"
                      className="px-3 py-2 text-base flex-1"
                    />
                    <button
                      onClick={() => confirmNewAlbum(row)}
                      disabled={!row.newAlbumTitle.trim()}
                      className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                      aria-label="Create album"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => updateRow(row.id, { creatingAlbum: false, newAlbumTitle: "", newAlbumType: "album" })}
                      className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                      aria-label="Cancel"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <SelectField
                  value={row.albumId}
                  onChange={(e) => handleAlbumSelect(row.id, e.target.value)}
                  disabled={!row.artistId}
                  variant="panel"
                  className="px-3 py-2 text-base"
                >
                  <option value="">No album (single)</option>
                  {albums
                    .filter((al) => al.artistId === row.artistId)
                    .map((al) => (
                      <option key={al.id} value={al.id}>
                        {al.title}
                      </option>
                    ))}
                  {row.artistId && <option value={NEW_OPTION}>+ New album...</option>}
                </SelectField>
              )}
              <TextField
                type="text"
                value={row.genre}
                onChange={(e) => updateRow(row.id, { genre: e.target.value })}
                placeholder="Genre (optional)"
                variant="panel"
                className="px-3 py-2 text-base"
              />
              <label className="flex items-center gap-2 bg-panel rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-elevated-hover transition-colors">
                <Music2 size={16} className="text-fg-subtle shrink-0" />
                <span className="truncate text-fg-muted">
                  {row.file ? row.file.name : "Choose audio file..."}
                  {row.duration ? ` · ${Math.floor(row.duration / 60)}:${String(row.duration % 60).padStart(2, "0")}` : ""}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFilePick(row.id, e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>

            {row.error && <p className="text-xs text-accent-red mt-2">{row.error}</p>}
          </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={addRow}
          className="flex items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-full hover:bg-hover transition-colors"
        >
          <Plus size={16} />
          Add another track
        </button>
        <button
          onClick={uploadAll}
          disabled={uploadingAll || allDone}
          className="ml-auto flex items-center gap-2 bg-brand text-black text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
        >
          {uploadingAll ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {allDone ? "All uploaded" : `Upload all (${rows.length})`}
        </button>
      </div>
    </div>
  );
}
