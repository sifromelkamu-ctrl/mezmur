import { ChevronLeft, Clock, ListMusic, Sparkles, TrendingUp, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import TrackRow from "../components/TrackRow";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { renderWithAmharicStyle } from "../utils/scriptText";
import {
  albumsApi,
  artistsApi,
  playlistsApi,
  podcastsApi,
  podcastToTrack,
  searchApi,
  sermonsApi,
  sermonToTrack,
  tracksApi,
  type ApiPlaylist,
  type ApiPodcast,
  type ApiSearchResults,
  type ApiSermon,
  type ApiTrack,
} from "../lib/api";

type BrowseKind = "trending" | "mood" | "language" | "era" | "sermons" | "podcasts";

interface BrowseTile {
  name: string;
  kind: BrowseKind;
  value?: string;
  gradient: readonly [string, string];
  icon: LucideIcon;
}

// Only the two auto-generated tiles live here — every other "section" is a
// curated Playlist (ownerId: null, see server/src/routes/playlists.ts),
// built by an admin via Add to Playlist, and fetched below instead of
// hardcoded so a newly-curated section shows up here automatically.
const BROWSE_TILES: BrowseTile[] = [
  { name: "Most Played", kind: "trending", gradient: ["#f2b705", "#7c2d12"], icon: TrendingUp },
  { name: "New Releases", kind: "era", value: "new", gradient: ["#14b866", "#052e16"], icon: Sparkles },
];

type ResultFilter = "all" | "songs" | "artists" | "albums" | "playlists";

const RECENT_KEY = "mezmur:recent-searches";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

const emptyResults: ApiSearchResults = { tracks: [], artists: [], albums: [], playlists: [] };

export default function Search() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const browseKind = searchParams.get("browse") as BrowseKind | null;
  const browseValue = searchParams.get("value") ?? undefined;
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const [results, setResults] = useState<ApiSearchResults>(emptyResults);
  const [loading, setLoading] = useState(false);
  const [browseTracks, setBrowseTracks] = useState<ApiTrack[] | null>(null);
  const [browseSermons, setBrowseSermons] = useState<ApiSermon[] | null>(null);
  const [browsePodcasts, setBrowsePodcasts] = useState<ApiPodcast[] | null>(null);
  const [sections, setSections] = useState<ApiPlaylist[]>([]);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const q = query.trim();
  const activeTile = BROWSE_TILES.find((tile) => tile.kind === browseKind && tile.value === browseValue);

  useEffect(() => {
    playlistsApi.list().then(setSections);
  }, []);

  useEffect(() => {
    if (!q) {
      setResults(emptyResults);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchApi
        .search(q)
        .then((data) => {
          setResults(data);
          const hasAny = data.tracks.length || data.artists.length || data.albums.length || data.playlists.length;
          if (hasAny) {
            setRecent((prev) => {
              const next = [q, ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
              saveRecent(next);
              return next;
            });
          }
        })
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    setResultFilter("all");
  }, [q]);

  useEffect(() => {
    if (!browseKind) {
      setBrowseTracks(null);
      setBrowseSermons(null);
      setBrowsePodcasts(null);
      return;
    }
    setLoading(true);
    setBrowseTracks(null);
    setBrowseSermons(null);
    setBrowsePodcasts(null);
    const load = async () => {
      if (browseKind === "trending") {
        setBrowseTracks(await tracksApi.trending(20));
      } else if (browseKind === "mood" && browseValue) {
        setBrowseTracks(await tracksApi.byMood(browseValue));
      } else if (browseKind === "language" && browseValue) {
        setBrowseTracks(await tracksApi.byLanguage(browseValue));
      } else if (browseKind === "era" && (browseValue === "classic" || browseValue === "new")) {
        setBrowseTracks(await tracksApi.byEra(browseValue));
      } else if (browseKind === "sermons") {
        setBrowseSermons(await sermonsApi.list());
      } else if (browseKind === "podcasts") {
        setBrowsePodcasts(await podcastsApi.list());
      }
    };
    load().finally(() => setLoading(false));
  }, [browseKind, browseValue]);

  const hasResults =
    results.tracks.length || results.artists.length || results.albums.length || results.playlists.length;

  const playArtist = async (id: string) => {
    const full = await artistsApi.get(id);
    if (full.topTracks[0]) playTrack(full.topTracks[0], full.topTracks);
  };

  const playAlbum = async (id: string) => {
    const full = await albumsApi.get(id);
    if (full.tracks[0]) playTrack(full.tracks[0], full.tracks);
  };

  const playPlaylist = async (id: string) => {
    const full = await playlistsApi.get(id);
    if (full.tracks?.[0]) playTrack(full.tracks[0], full.tracks);
  };

  const openBrowseTile = (tile: BrowseTile) => {
    const next: Record<string, string> = { browse: tile.kind };
    if (tile.value) next.value = tile.value;
    setSearchParams(next);
  };

  const runSearch = (text: string) => setSearchParams(text ? { q: text } : {}, { replace: true });

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  const removeRecent = (text: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r !== text);
      saveRecent(next);
      return next;
    });
  };

  if (browseKind) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 mb-6 -ml-2">
          <button
            onClick={() => setSearchParams({})}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0"
            aria-label="Back to browse"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-2xl font-bold">{activeTile?.name ?? "Browse"}</h1>
        </div>

        {loading ? (
          <p className="text-fg-muted">{t("loading")}</p>
        ) : browseTracks ? (
          browseTracks.length > 0 ? (
            <div>
              {browseTracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i + 1} queue={browseTracks} />
              ))}
            </div>
          ) : (
            <p className="text-fg-muted text-sm">No songs found in this category yet.</p>
          )
        ) : browseSermons ? (
          <div className="grid grid-cols-2 gap-4">
            {browseSermons.map((sermon) => (
              <Card
                key={sermon.id}
                title={sermon.title}
                subtitle={sermon.speaker}
                gradient={sermon.gradient}
                to={`/sermon/${sermon.id}`}
                showSubtitle
                onPlay={() => playTrack(sermonToTrack(sermon))}
              />
            ))}
          </div>
        ) : browsePodcasts ? (
          <div className="grid grid-cols-2 gap-4">
            {browsePodcasts.map((podcast) => (
              <Card
                key={podcast.id}
                title={podcast.title}
                subtitle={podcast.host}
                gradient={podcast.gradient}
                to={`/podcast/${podcast.id}`}
                showSubtitle
                onPlay={() => playTrack(podcastToTrack(podcast))}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const filters: { id: ResultFilter; label: string; count: number }[] = [
    {
      id: "all",
      label: t("all"),
      count: results.tracks.length + results.artists.length + results.albums.length + results.playlists.length,
    },
    { id: "songs", label: t("songs"), count: results.tracks.length },
    { id: "artists", label: t("artists"), count: results.artists.length },
    { id: "albums", label: t("albums"), count: results.albums.length },
    { id: "playlists", label: t("playlists"), count: results.playlists.length },
  ];

  return (
    <div className="px-6 py-6">
      {q ? (
        loading && !hasResults ? (
          <p className="text-fg-muted">{t("searching")}</p>
        ) : hasResults ? (
          <div>
            <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
              {filters
                .filter((f) => f.id === "all" || f.count > 0)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setResultFilter(f.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                      resultFilter === f.id ? "bg-white text-black" : "bg-elevated text-fg-muted hover:bg-elevated-hover"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
            </div>

            <div className="space-y-8">
              {results.tracks.length > 0 && (resultFilter === "all" || resultFilter === "songs") && (
                <section>
                  <h2 className="text-xl font-bold mb-3">{t("songs")}</h2>
                  {results.tracks.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i + 1} queue={results.tracks} />
                  ))}
                </section>
              )}
              {results.artists.length > 0 && (resultFilter === "all" || resultFilter === "artists") && (
                <section>
                  <h2 className="text-xl font-bold mb-4">{t("artists")}</h2>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6">
                    {results.artists.map((artist) => (
                      <Card
                        key={artist.id}
                        title={artist.name}
                        subtitle="Artist"
                        gradient={artist.gradient}
                        to={`/artist/${artist.id}`}
                        portrait
                        photoUrl={artist.photoUrl}
                        playing={isPlaying && currentTrack?.artistId === artist.id}
                        onPlay={() => playArtist(artist.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {results.albums.length > 0 && (resultFilter === "all" || resultFilter === "albums") && (
                <section>
                  <h2 className="text-xl font-bold mb-4">{t("albums")}</h2>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6">
                    {results.albums.map((album) => (
                      <Card
                        key={album.id}
                        title={album.title}
                        subtitle={album.year ? `${album.year} · Album` : "Album"}
                        gradient={album.gradient}
                        to={`/album/${album.id}`}
                        photoUrl={album.coverUrl}
                        large
                        entityType="album"
                        entityId={album.id}
                        artworkFrame={album.artworkFrame}
                        playing={isPlaying && currentTrack?.albumId === album.id}
                        onPlay={() => playAlbum(album.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {results.playlists.length > 0 && (resultFilter === "all" || resultFilter === "playlists") && (
                <section>
                  <h2 className="text-xl font-bold mb-4">{t("playlists")}</h2>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6">
                    {results.playlists.map((pl) => (
                      <Card
                        key={pl.id}
                        title={pl.title}
                        subtitle={pl.description}
                        gradient={pl.gradient}
                        to={`/playlist/${pl.id}`}
                        large
                        photoUrl={pl.coverUrl}
                        entityType="playlist"
                        entityId={pl.id}
                        artworkFrame={pl.artworkFrame}
                        onPlay={() => playPlaylist(pl.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
          <p className="text-fg-muted">
            {t("noResultsFor")} "{query}"
          </p>
        )
      ) : (
        <>
          {recent.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Clock size={18} className="text-fg-muted" />
                  Recent searches
                </h2>
                <button
                  onClick={clearRecent}
                  className="text-xs font-semibold text-fg-muted hover:text-fg transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <div
                    key={r}
                    className="group flex items-center gap-1.5 bg-elevated hover:bg-elevated-hover rounded-full pl-4 pr-2 py-2 transition-colors cursor-pointer"
                    onClick={() => runSearch(r)}
                  >
                    <span className="text-sm font-medium">{r}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecent(r);
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-hover-strong transition-colors"
                      aria-label={`Remove ${r} from recent searches`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <h2 className="text-xl font-bold mb-4">{t("browseAll")}</h2>
          <div className="grid grid-cols-2 gap-4">
            {BROWSE_TILES.map((tile) => (
              <div
                key={tile.name}
                onClick={() => openBrowseTile(tile)}
                className="card-hover relative h-16 rounded-xl overflow-hidden cursor-pointer px-4 shadow-lg flex items-center gap-3"
                style={{ backgroundImage: `linear-gradient(135deg, ${tile.gradient[0]}, ${tile.gradient[1]})` }}
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex items-center justify-center">
                  <tile.icon size={18} className="text-white" />
                </div>
                <p className="font-bold text-base text-white truncate">{tile.name}</p>
              </div>
            ))}
            {sections.map((pl) => (
              <div
                key={pl.id}
                onClick={() => navigate(`/playlist/${pl.id}`)}
                className="card-hover relative h-16 rounded-xl overflow-hidden cursor-pointer px-4 shadow-lg flex items-center gap-3"
                style={{ backgroundImage: `linear-gradient(135deg, ${pl.gradient[0]}, ${pl.gradient[1]})` }}
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex items-center justify-center">
                  <ListMusic size={18} className="text-white" />
                </div>
                <p className="font-bold text-base text-white truncate">{renderWithAmharicStyle(pl.title)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
