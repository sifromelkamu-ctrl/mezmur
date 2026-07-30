import { LogIn, Mic2, Plus, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CoverArt from "../components/CoverArt";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { useCustomArtists } from "../context/CustomArtistsContext";

export default function Artists() {
  const { user } = useAuth();
  const { artists, loading, addArtist, removeArtist } = useCustomArtists();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await addArtist(name);
      setName("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <h1 className="text-3xl font-bold mb-1">Your Artists</h1>
      <p className="text-sm text-fg-muted mb-6">
        Add an artist by name, then open their page to add albums whenever you're ready.
      </p>

      {!user ? (
        <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md mb-8">
          <LogIn size={18} />
          <span className="flex-1">Log in to add and manage your own artists.</span>
          <button
            onClick={() => navigate("/auth")}
            className="bg-brand text-black font-bold rounded-full px-4 py-1.5 text-xs hover:scale-105 transition-transform shrink-0"
          >
            Log in
          </button>
        </div>
      ) : (
        <form onSubmit={handleAdd} className="flex items-center gap-2 mb-8 max-w-md">
          <TextField
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Artist name, e.g. Tigist Bekele"
            pill
            className="px-4 py-2 text-base flex-1"
          />
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="w-10 h-10 shrink-0 rounded-full bg-brand text-black flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Add artist"
          >
            <Plus size={18} />
          </button>
        </form>
      )}

      {user && loading ? (
        <p className="text-fg-muted text-sm">Loading your artists...</p>
      ) : user && artists.length === 0 ? (
        <div className="flex items-center gap-3 text-fg-subtle text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          <Mic2 size={18} />
          No artists added yet. Add one above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {artists.map((artist) => (
            <div
              key={artist.id}
              onClick={() => navigate(`/my-artist/${artist.id}`)}
              className="card-hover group relative bg-elevated hover:bg-elevated-hover rounded-lg p-4 cursor-pointer"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeArtist(artist.id);
                }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity z-10"
                aria-label={`Remove ${artist.name}`}
              >
                <X size={13} />
              </button>
              <div className="mb-4">
                <CoverArt
                  gradient={artist.gradient}
                  size="md"
                  rounded
                  photoUrl={artist.photoUrl}
                  entityType="artist"
                  entityId={artist.id}
                />
              </div>
              <p className="text-sm font-semibold truncate">{artist.name}</p>
              <p className="text-xs text-fg-muted mt-1">
                {artist.albums.length} album{artist.albums.length === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
