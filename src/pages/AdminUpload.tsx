import { AlertCircle, Check, ChevronLeft, Loader2, Music2, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { adminApi, albumsApi, artistsApi, type ApiAlbum, type ApiAlbumType, type ApiArtist } from "../lib/api";

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
  };
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
    const artist = await adminApi.createArtist(name);
    setArtists((prev) => [...prev, artist].sort((a, b) => a.name.localeCompare(b.name)));
    updateRow(row.id, { artistId: artist.id, creatingArtist: false, newArtistName: "" });
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
    const album = await adminApi.addAlbum(row.artistId, title, row.newAlbumType);
    setAlbums((prev) => [...prev, album]);
    updateRow(row.id, { albumId: album.id, creatingAlbum: false, newAlbumTitle: "", newAlbumType: "album" });
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
      });
      await adminApi.putAudioFile(upload.signedUrl, row.file);
      updateRow(row.id, { status: "done" });
    } catch (err) {
      updateRow(row.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  };

  const uploadAll = async () => {
    setUploadingAll(true);
    for (const row of rows) {
      if (row.status !== "done") await uploadRow(row);
    }
    setUploadingAll(false);
  };

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

      <div className="flex flex-col gap-4">
        {rows.map((row, idx) => (
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
