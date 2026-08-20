import { Disc3, Plus, X } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import TextField from "../components/form/TextField";
import { useCustomArtists } from "../context/CustomArtistsContext";

export default function CustomArtistDetail() {
  const { id } = useParams();
  const { artists, loading, addAlbum, removeAlbum } = useCustomArtists();
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const artist = artists.find((a) => a.id === id);

  if (loading) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Artist not found.
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await addAlbum(artist.id, title);
      setTitle("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div
        className="relative flex flex-col items-center text-center gap-4 px-6 pb-6"
        style={{
          backgroundImage: `linear-gradient(180deg, ${artist.gradient[0]}88, ${artist.gradient[1]}33)`,
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 4rem)",
        }}
      >
        <BackButton variant="glass" />
        <CoverArt gradient={artist.gradient} size="xl" rounded photoUrl={artist.photoUrl} />
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide">Artist</p>
          <h1 className="text-3xl font-black tracking-tight mt-2 mb-4 break-words">{artist.name}</h1>
          <p className="text-sm text-fg-muted">
            {artist.albums.length} album{artist.albums.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <h2 className="text-xl font-bold mb-3">Add an album</h2>
        <form onSubmit={handleAdd} className="flex items-center gap-2 mb-8 max-w-md">
          <TextField
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Album title"
            pill
            className="px-4 py-2 text-base flex-1"
          />
          <button
            type="submit"
            disabled={!title.trim() || submitting}
            className="w-10 h-10 shrink-0 rounded-full bg-brand text-black flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Add album"
          >
            <Plus size={18} />
          </button>
        </form>

        <h2 className="text-xl font-bold mb-4">Albums</h2>
        {artist.albums.length === 0 ? (
          <div className="flex items-center gap-3 text-fg-subtle text-sm bg-elevated/50 rounded-lg p-4">
            <Disc3 size={18} />
            No albums yet. Add one above.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {artist.albums.map((album) => (
              <div key={album.id} className="group relative bg-elevated rounded-lg p-4">
                <button
                  onClick={() => removeAlbum(artist.id, album.id)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity z-10"
                  aria-label={`Remove ${album.title}`}
                >
                  <X size={13} />
                </button>
                <div className="mb-4">
                  <CoverArt
                    gradient={artist.gradient}
                    size="md"
                    photoUrl={album.coverUrl}
                    entityType="album"
                    entityId={album.id}
                    artworkFrame={album.artworkFrame}
                  />
                </div>
                <p className="text-sm font-semibold truncate">{album.title}</p>
                <p className="text-xs text-fg-muted mt-1">Album</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
