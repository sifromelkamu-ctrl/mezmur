import { ArrowLeft, Check, MoreVertical, Music2, Search as SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/form/TextField";
import TrackRow from "../components/TrackRow";
import { useLanguage } from "../context/LanguageContext";
import { tracksApi, type ApiTrack } from "../lib/api";

type SortMode = "title" | "artist" | "duration" | "plays";

const sortOptions: { id: SortMode; label: string }[] = [
  { id: "title", label: "Sort by Title" },
  { id: "artist", label: "Sort by Artist" },
  { id: "duration", label: "Sort by Duration" },
  { id: "plays", label: "Sort by Most Played" },
];

// Spotify-style "all songs" screen: a plain vertical TrackRow list over the
// full catalog, with client-side (not server-hit) search/sort — the same
// instant-filter pattern already used by Library.tsx's tabs.
export default function AllSongs() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tracks, setTracks] = useState<ApiTrack[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("title");
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    let cancelled = false;
    tracksApi
      .list()
      .then((data) => {
        if (!cancelled) setTracks(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTracks = useMemo(() => {
    if (!tracks) return [];
    const q = query.trim().toLowerCase();
    return q
      ? tracks.filter(
          (tr) =>
            tr.title.toLowerCase().includes(q) ||
            (tr.artistName ?? "").toLowerCase().includes(q) ||
            (tr.albumTitle ?? "").toLowerCase().includes(q)
        )
      : tracks;
  }, [tracks, query]);

  const sortedTracks = useMemo(() => {
    const copy = [...filteredTracks];
    switch (sort) {
      case "title":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "artist":
        return copy.sort((a, b) => (a.artistName ?? "").localeCompare(b.artistName ?? ""));
      case "duration":
        return copy.sort((a, b) => b.duration - a.duration);
      case "plays":
        return copy.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    }
  }, [filteredTracks, sort]);

  return (
    <div className="px-6 py-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back to Home"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">{t("songs")}</h1>
        <div className="relative">
          <button
            onClick={() => setShowSort((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Sort options"
          >
            <MoreVertical size={20} />
          </button>
          {showSort && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-elevated rounded-lg shadow-2xl py-1 z-20">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSort(opt.id);
                      setShowSort(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-elevated-hover transition-colors text-left"
                  >
                    {opt.label}
                    {sort === opt.id && <Check size={14} className="text-brand" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <TextField
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists, albums..."
          pill
          className="pl-9 pr-4 py-2 text-sm w-full"
        />
      </div>

      {error ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          Couldn't load songs. Check your connection and try again.
        </div>
      ) : tracks === null ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2 animate-pulse">
              <div className="w-6 h-6 rounded bg-elevated shrink-0" />
              <div className="w-10 h-10 rounded-md bg-elevated shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-elevated rounded mb-2 w-1/2" />
                <div className="h-3 bg-elevated rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedTracks.length === 0 ? (
        <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          <Music2 size={18} />
          {query ? `No songs found for "${query}"` : "No songs yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sortedTracks.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i + 1}
              queue={sortedTracks}
              showAlbumTitle
              showActions
            />
          ))}
        </div>
      )}
    </div>
  );
}
