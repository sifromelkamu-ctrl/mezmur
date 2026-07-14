import { Check, ListMusic, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TextField from "./form/TextField";
import { useAuth } from "../context/useAuth";
import { playlistsApi, type ApiPlaylist, type ApiTrack } from "../lib/api";
import { renderWithAmharicStyle } from "../utils/scriptText";

interface AddToPlaylistModalProps {
  track: ApiTrack;
  onClose: () => void;
}

export default function AddToPlaylistModal({ track, onClose }: AddToPlaylistModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  // Curated "section" playlists (ownerId: null) — the same ones Search's
  // Browse-all grid surfaces to every listener. Admin-only here: dropping a
  // song into one of these changes what every user sees in Search, so only
  // an admin gets the option.
  const [sections, setSections] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIsSection, setNewIsSection] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([playlistsApi.mine(), isAdmin ? playlistsApi.list() : Promise.resolve([])])
      .then(([mine, curated]) => {
        setPlaylists(mine);
        setSections(curated);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInPlaylist = (pl: ApiPlaylist) => (pl.trackIds ?? []).includes(track.id);

  const toggle = async (pl: ApiPlaylist) => {
    setPendingId(pl.id);
    try {
      if (isInPlaylist(pl)) {
        await playlistsApi.removeTrack(pl.id, track.id);
      } else {
        await playlistsApi.addTrack(pl.id, track.id);
      }
      load();
    } finally {
      setPendingId(null);
    }
  };

  const createAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const pl = await playlistsApi.create(newTitle.trim(), { curated: newIsSection });
      await playlistsApi.addTrack(pl.id, track.id);
      setNewTitle("");
      setNewIsSection(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const renderRow = (pl: ApiPlaylist) => {
    const added = isInPlaylist(pl);
    return (
      <button
        key={pl.id}
        onClick={() => toggle(pl)}
        disabled={pendingId === pl.id}
        className="w-full flex items-center gap-3 py-2.5 hover:bg-hover rounded-md transition-colors text-left disabled:opacity-50"
      >
        <span
          className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundImage: `linear-gradient(135deg, ${pl.gradient[0]}, ${pl.gradient[1]})` }}
        >
          <ListMusic size={16} className="text-white/80" />
        </span>
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{renderWithAmharicStyle(pl.title)}</span>
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
            added ? "bg-brand border-brand text-black" : "border-border text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      </button>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel rounded-xl w-full max-w-sm p-5 relative shadow-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Add to playlist</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-fg-muted truncate mb-4">{renderWithAmharicStyle(track.title)}</p>

        <form onSubmit={createAndAdd} className="mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <TextField
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New playlist name"
              pill
              className="px-4 py-2 text-base flex-1"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || creating}
              className="w-9 h-9 shrink-0 rounded-full bg-brand text-black flex items-center justify-center disabled:opacity-40"
              aria-label="Create playlist and add song"
            >
              <Plus size={16} />
            </button>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-fg-muted mt-2 pl-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newIsSection}
                onChange={(e) => setNewIsSection(e.target.checked)}
              />
              Make this a Section (visible to everyone in Search)
            </label>
          )}
        </form>

        <div className="overflow-y-auto no-scrollbar -mx-2 px-2">
          {loading ? (
            <p className="text-sm text-fg-muted py-4">Loading your playlists...</p>
          ) : (
            <>
              <p className="text-xs font-bold text-fg-subtle uppercase tracking-wide px-1 mb-1">Your Playlists</p>
              {playlists.length === 0 ? (
                <p className="text-sm text-fg-muted py-2 px-1 mb-2">
                  You don't have any playlists yet. Create one above.
                </p>
              ) : (
                playlists.map(renderRow)
              )}

              {isAdmin && (
                <>
                  <p className="text-xs font-bold text-fg-subtle uppercase tracking-wide px-1 mt-4 mb-1">
                    Sections (Search)
                  </p>
                  {sections.length === 0 ? (
                    <p className="text-sm text-fg-muted py-2 px-1">
                      No sections yet. Check "Make this a Section" above to create one.
                    </p>
                  ) : (
                    sections.map(renderRow)
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
