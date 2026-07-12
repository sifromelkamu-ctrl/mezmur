import { Clock, Play, Plus, Search as SearchIcon, Shuffle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import TrackRow from "../components/TrackRow";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { playlistsApi, searchApi, type ApiPlaylist, type ApiTrack } from "../lib/api";

export default function PlaylistDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { playTrack, shuffle, toggleShuffle } = usePlayer();
  const [playlist, setPlaylist] = useState<ApiPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSong, setShowAddSong] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiTrack[]>([]);

  const load = () => {
    if (!id) return;
    setLoading(true);
    playlistsApi
      .get(id)
      .then(setPlaylist)
      .catch(() => setPlaylist(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchApi.search(query.trim()).then((r) => setResults(r.tracks));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  if (loading) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Playlist not found.
      </div>
    );
  }

  const isOwner = Boolean(user && playlist.ownerId === user.id);
  const playlistTracks = playlist.tracks ?? [];
  const totalMinutes = Math.round(playlistTracks.reduce((sum, t) => sum + t.duration, 0) / 60);
  const existingTrackIds = new Set(playlistTracks.map((t) => t.id));

  const addTrack = async (trackId: string) => {
    if (!id) return;
    await playlistsApi.addTrack(id, trackId);
    load();
  };

  const removeTrack = async (trackId: string) => {
    if (!id) return;
    await playlistsApi.removeTrack(id, trackId);
    load();
  };

  const handleShuffle = () => {
    if (playlistTracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = playlistTracks[Math.floor(Math.random() * playlistTracks.length)];
    playTrack(randomTrack, playlistTracks);
  };

  return (
    <div>
      <div
        className="relative flex flex-col items-center text-center gap-4 px-6 pt-10 pb-6"
        style={{
          backgroundImage: `linear-gradient(180deg, ${playlist.gradient[0]}66, ${playlist.gradient[1]}22)`,
        }}
      >
        <BackButton />
        <CoverArt
          gradient={playlist.gradient}
          size="xl"
          photoUrl={playlist.coverUrl}
          entityType="playlist"
          entityId={playlist.id}
          artworkFrame={playlist.artworkFrame}
          onFrameSaved={(frame) => setPlaylist({ ...playlist, artworkFrame: frame })}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide">{isOwner ? "Your Playlist" : "Playlist"}</p>
          <h1 className="text-3xl font-black tracking-tight mt-2 mb-4 break-words">
            {playlist.title}
          </h1>
          {playlist.description && <p className="text-fg-muted text-sm mb-2">{playlist.description}</p>}
          <p className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">Mezmur</span> · {playlistTracks.length} songs, about{" "}
            {totalMinutes} min
          </p>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => playlistTracks[0] && playTrack(playlistTracks[0], playlistTracks)}
            className="w-14 h-14 rounded-full bg-brand text-black flex items-center justify-center shadow-lg shadow-brand/30 hover:scale-110 hover:shadow-brand/50 transition-all"
            aria-label="Play playlist"
          >
            <Play size={24} fill="black" className="ml-1" />
          </button>
          <button
            onClick={handleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
              shuffle ? "border-brand text-brand" : "border-border text-fg-muted hover:text-fg"
            }`}
            aria-label="Shuffle playlist"
          >
            <Shuffle size={18} />
          </button>
          {isOwner && (
            <button
              onClick={() => setShowAddSong((s) => !s)}
              className="flex items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg border border-border hover:border-fg-subtle rounded-full px-4 py-2 transition-colors"
            >
              <Plus size={16} />
              Add songs
            </button>
          )}
        </div>

        {isOwner && showAddSong && (
          <div className="bg-elevated rounded-lg p-4 mb-8 max-w-xl">
            <div className="relative mb-3">
              <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <TextField
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for songs to add"
                variant="panel"
                pill
                className="pl-9 pr-4 py-2 text-base w-full"
              />
            </div>
            <div className="max-h-72 overflow-y-auto no-scrollbar">
              {results.map((track) => {
                const alreadyAdded = existingTrackIds.has(track.id);
                return (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-hover transition-colors"
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
                      <p className="text-xs text-fg-muted truncate">{track.artistName}</p>
                    </div>
                    <button
                      onClick={() => !alreadyAdded && addTrack(track.id)}
                      disabled={alreadyAdded}
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        alreadyAdded
                          ? "bg-elevated-hover text-fg-subtle"
                          : "bg-brand text-black hover:scale-110 transition-transform"
                      }`}
                      aria-label={`Add ${track.title}`}
                    >
                      {alreadyAdded ? <X size={14} /> : <Plus size={14} />}
                    </button>
                  </div>
                );
              })}
              {query.trim() && results.length === 0 && (
                <p className="text-sm text-fg-subtle px-2 py-2">No songs found.</p>
              )}
            </div>
          </div>
        )}

        {playlistTracks.length > 0 ? (
          <>
            <div className="grid grid-cols-[24px_1fr_auto] items-center gap-4 px-4 py-2 text-xs text-fg-muted border-b border-border mb-2">
              <span>#</span>
              <span>Title</span>
              <span className="flex justify-end">
                <Clock size={14} />
              </span>
            </div>

            <div>
              {playlistTracks.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={i + 1}
                  queue={playlistTracks}
                  onRemove={isOwner ? () => removeTrack(track.id) : undefined}
                />
              ))}
            </div>
          </>
        ) : (
          isOwner && (
            <p className="text-fg-muted text-sm">No songs yet — use "Add songs" above to start building this playlist.</p>
          )
        )}
      </div>
    </div>
  );
}
