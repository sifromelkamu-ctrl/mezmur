import { ArrowLeft, Check, Music2, MoreVertical, Search as SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArtTile from "../components/home/ArtTile";
import TextField from "../components/form/TextField";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { singlesApi, type ApiTrack } from "../lib/api";

type SortMode = "title" | "artist" | "duration";

const sortOptions: { id: SortMode; label: string }[] = [
  { id: "title", label: "Sort by Title" },
  { id: "artist", label: "Sort by Artist" },
  { id: "duration", label: "Sort by Duration" },
];

// A Single is a track with no albumId at all — a dedicated category, fetched
// from a route that only ever returns those (server/src/routes/singles.ts),
// never the general track catalog, so regular album tracks can never leak
// in here. Same fetch-search-sort-list shell as AllSongs.tsx.
export default function AllSingles() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const [singles, setSingles] = useState<ApiTrack[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("title");
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    let cancelled = false;
    singlesApi
      .list()
      .then((data) => {
        if (!cancelled) setSingles(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSingles = useMemo(() => {
    if (!singles) return [];
    const q = query.trim().toLowerCase();
    return q
      ? singles.filter(
          (tr) => tr.title.toLowerCase().includes(q) || (tr.artistName ?? "").toLowerCase().includes(q)
        )
      : singles;
  }, [singles, query]);

  const sortedSingles = useMemo(() => {
    const copy = [...filteredSingles];
    switch (sort) {
      case "title":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "artist":
        return copy.sort((a, b) => (a.artistName ?? "").localeCompare(b.artistName ?? ""));
      case "duration":
        return copy.sort((a, b) => b.duration - a.duration);
    }
  }, [filteredSingles, sort]);

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
        <h1 className="text-lg font-bold">{t("singles")}</h1>
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
          placeholder="Search singles, artists..."
          pill
          className="pl-9 pr-4 py-2 text-sm w-full"
        />
      </div>

      {error ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          Couldn't load singles. Check your connection and try again.
        </div>
      ) : singles === null ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-2xl bg-elevated mb-3" />
              <div className="h-3 bg-elevated rounded mb-2 w-3/4" />
              <div className="h-3 bg-elevated rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : sortedSingles.length === 0 ? (
        <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          <Music2 size={18} />
          {query ? `No singles found for "${query}"` : "No singles yet."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6">
          {sortedSingles.map((track) => (
            <ArtTile
              key={track.id}
              title={track.title}
              subtitle={track.artistName}
              gradient={track.gradient}
              photoUrl={track.coverUrl}
              entityType="track"
              entityId={track.id}
              artworkFrame={track.artworkFrame}
              playing={isPlaying && currentTrack?.id === track.id}
              showPlayIcon
              // A Single has no detail page of its own — tapping the tile
              // plays it directly instead of navigating anywhere.
              onCardClick={() => playTrack(track, sortedSingles)}
              onPlay={() => playTrack(track, sortedSingles)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
