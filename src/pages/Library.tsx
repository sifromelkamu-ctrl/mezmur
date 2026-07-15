import {
  ArrowDownWideNarrow,
  Check,
  Disc3,
  Heart,
  ListMusic,
  Mic2,
  Play,
  Plus,
  Search as SearchIcon,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import TrackRow from "../components/TrackRow";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { useFavorites } from "../context/FavoritesContext";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { getAvatarColor, useTheme } from "../context/ThemeContext";
import { albumsApi, artistsApi, playlistsApi, type ApiAlbum, type ApiArtist, type ApiPlaylist } from "../lib/api";

type Filter = "artists" | "albums" | "playlists" | "favorites";
type ArtistSort = "name" | "popular";

const validFilters = new Set<string>(["artists", "albums", "playlists", "favorites"]);
const ARTIST_SORT_KEY = "mezmur:library-artist-sort";

// Defined at module scope (not inside Library) so its identity stays stable
// across Library re-renders — a component redefined inline on every render
// gets remounted by React on every state change, which reset Card's
// internal image-fade-in state and caused a visible blink.
function ArtistCard({
  artist,
  openMenuFor,
  onOpenMenu,
  onPlay,
  onNavigate,
}: {
  artist: ApiArtist;
  openMenuFor: string | null;
  onOpenMenu: (id: string | null) => void;
  onPlay: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true only once the long-press timer actually fires, so the
  // click that follows (finger/mouse lifting after the menu opens) can
  // be swallowed instead of falling through to Card's own navigate().
  const longPressFired = useRef(false);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPressTimer = () => {
    longPressFired.current = false;
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onOpenMenu(artist.id);
    }, 500);
  };

  return (
    <div
      className="relative select-none"
      onPointerDown={startPressTimer}
      onPointerUp={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (longPressFired.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressFired.current = false;
        }
      }}
    >
      <Card
        title={artist.name}
        subtitle={artist.isGroup ? "Worship Team" : "Artist"}
        gradient={artist.gradient}
        to={`/artist/${artist.id}`}
        portrait
        fullWidth
        photoUrl={artist.photoUrl}
        onPlay={() => onPlay(artist.id)}
      />
      {openMenuFor === artist.id && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => onOpenMenu(null)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 bg-elevated rounded-xl shadow-2xl py-1 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-2.5 text-sm font-semibold text-fg truncate border-b border-white/10">
              {artist.name}
            </p>
            <button
              onClick={() => {
                onOpenMenu(null);
                onPlay(artist.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
            >
              <Play size={14} />
              Play
            </button>
            <button
              onClick={() => {
                onOpenMenu(null);
                onNavigate(artist.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
            >
              <Mic2 size={14} />
              Go to artist
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Library() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { favorites } = useFavorites();
  const { avatarColorId } = useTheme();
  const avatarColor = getAvatarColor(avatarColorId);
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<Filter>(
    initialFilter && validFilters.has(initialFilter) ? (initialFilter as Filter) : "artists"
  );
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [myPlaylists, setMyPlaylists] = useState<ApiPlaylist[]>([]);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [artistSort, setArtistSortState] = useState<ArtistSort>(
    () => (localStorage.getItem(ARTIST_SORT_KEY) as ArtistSort | null) ?? "popular"
  );
  const [showArtistSort, setShowArtistSort] = useState(false);
  const setArtistSort = (sort: ArtistSort) => {
    localStorage.setItem(ARTIST_SORT_KEY, sort);
    setArtistSortState(sort);
  };
  const navigate = useNavigate();

  const filterLabels: Record<Filter, string> = {
    artists: t("artists"),
    albums: t("albums"),
    playlists: t("playlists"),
    favorites: "Favorites",
  };
  const filterIcons: Record<Filter, typeof UserRound> = {
    artists: UserRound,
    albums: Disc3,
    playlists: ListMusic,
    favorites: Heart,
  };

  useEffect(() => {
    Promise.all([playlistsApi.list(), artistsApi.list(), albumsApi.list()])
      .then(([pl, ar, al]) => {
        setPlaylists(pl);
        setArtists(ar);
        setAlbums(al);
      })
      .finally(() => setLoading(false));
    if (user) {
      playlistsApi.mine().then(setMyPlaylists);
    } else {
      setMyPlaylists([]);
    }
  }, [user, refreshKey]);

  const showPlaylists = filter === "playlists";
  const showArtists = filter === "artists";
  const showAlbums = filter === "albums";
  const showFavorites = filter === "favorites";

  const q = query.trim().toLowerCase();
  const filteredForYou = q ? playlists.filter((p) => p.title.toLowerCase().includes(q)) : playlists;
  const filteredMyPlaylists = q ? myPlaylists.filter((p) => p.title.toLowerCase().includes(q)) : myPlaylists;
  const filteredArtists = (q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists)
    .slice()
    .sort((a, b) => (artistSort === "popular" ? b.monthlyListeners - a.monthlyListeners : a.name.localeCompare(b.name)));
  // Concert Albums are a dedicated category (see Home's Concerts section /
  // /concerts) and never appear alongside regular albums here.
  const nonConcertAlbums = albums.filter((a) => a.albumType !== "live");
  const filteredAlbums = q ? nonConcertAlbums.filter((a) => a.title.toLowerCase().includes(q)) : nonConcertAlbums;

  const playArtist = async (id: string) => {
    const full = await artistsApi.get(id);
    if (full.topTracks[0]) playTrack(full.topTracks[0], full.topTracks);
  };

  const playAlbum = async (id: string) => {
    const full = await albumsApi.get(id);
    if (full.tracks[0]) playTrack(full.tracks[0], full.tracks);
  };

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          aria-label={t("home")}
          className="justify-self-start w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: avatarColor.background }}
        >
          <span className="font-bold text-sm" style={{ color: avatarColor.text }}>
            M
          </span>
        </button>
        {/* text-lg (1.125rem) + 9% = 1.226rem — kept identical to Topbar's wordmark size */}
        <span className="justify-self-center font-abyssinica font-bold text-[1.226rem] tracking-tight bg-gradient-to-r from-gold to-gold-dark bg-clip-text text-transparent whitespace-nowrap">
          መዝሙር
        </span>
        <div className="justify-self-end flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/settings")}
            aria-label={t("settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center ring-1 ring-border text-gold hover:bg-hover transition-colors"
          >
            <Settings size={17} />
          </button>
          {!user && (
            <button
              onClick={() => navigate("/auth")}
              className="bg-white text-black text-xs font-bold rounded-full px-3.5 py-2 hover:scale-105 transition-transform shrink-0"
            >
              {t("logIn")}
            </button>
          )}
        </div>
      </div>

      {filter === "playlists" && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => (user ? setShowCreatePlaylist(true) : navigate("/auth"))}
            className="flex items-center gap-2 bg-brand text-black text-sm font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform"
          >
            <Plus size={16} />
            {t("createPlaylist")}
          </button>
        </div>
      )}

      <div className="relative mb-6">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
        <TextField
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchYourLibrary")}
          pill
          className="pl-9 pr-10 py-2 text-base w-full"
        />
        <Sparkles size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand pointer-events-none" />
      </div>

      <div className="flex items-center gap-1 mb-6 flex-nowrap overflow-x-auto no-scrollbar">
        {(["artists", "albums", "playlists", "favorites"] as Filter[]).map((f) => {
          const Icon = filterIcons[f];
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors border shrink-0 ${
                active
                  ? "bg-elevated text-brand border-brand shadow-[0_0_16px_-6px_var(--color-brand)]"
                  : "bg-transparent text-fg border-border hover:bg-hover"
              }`}
            >
              <Icon size={13} />
              {filterLabels[f]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-fg-muted">{t("loading")}</p>
      ) : (
        <>
          {showArtists && filteredArtists.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-end max-w-2xl mb-2 relative">
                <button
                  onClick={() => setShowArtistSort((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg px-3 py-2.5 rounded-md hover:bg-hover transition-colors"
                >
                  <ArrowDownWideNarrow size={14} />
                  Sort
                </button>
                {showArtistSort && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowArtistSort(false)} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-elevated rounded-lg shadow-2xl py-1 z-20">
                      {(
                        [
                          { id: "name", label: "Sort by Name" },
                          { id: "popular", label: "Sort by Popularity" },
                        ] as { id: ArtistSort; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setArtistSort(opt.id);
                            setShowArtistSort(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-elevated-hover transition-colors text-left"
                        >
                          {opt.label}
                          {artistSort === opt.id && <Check size={14} className="text-brand" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredArtists.map((artist) => (
                  <ArtistCard
                    key={artist.id}
                    artist={artist}
                    openMenuFor={openMenuFor}
                    onOpenMenu={setOpenMenuFor}
                    onPlay={playArtist}
                    onNavigate={(id) => navigate(`/artist/${id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {showAlbums && filteredAlbums.length > 0 && (
            <section className="mb-8">
              <div className="grid grid-cols-2 gap-4">
                {filteredAlbums.map((album) => (
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
                    onPlay={() => playAlbum(album.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {showPlaylists && filteredMyPlaylists.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold mb-3">My Playlists</h2>
              <div className="grid grid-cols-2 gap-4">
                {filteredMyPlaylists.map((pl) => (
                  <Card
                    key={pl.id}
                    title={pl.title}
                    subtitle={`Playlist · ${pl.trackIds?.length ?? 0} songs`}
                    gradient={pl.gradient}
                    to={`/playlist/${pl.id}`}
                    photoUrl={pl.coverUrl}
                    large
                    entityType="playlist"
                    entityId={pl.id}
                    artworkFrame={pl.artworkFrame}
                    onPlay={() => navigate(`/playlist/${pl.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {showPlaylists && filteredForYou.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold mb-3">For You</h2>
              <div className="grid grid-cols-2 gap-4">
                {filteredForYou.map((pl) => (
                  <Card
                    key={pl.id}
                    title={pl.title}
                    subtitle={`Playlist · ${pl.trackIds?.length ?? 0} songs`}
                    gradient={pl.gradient}
                    to={`/playlist/${pl.id}`}
                    photoUrl={pl.coverUrl}
                    large
                    entityType="playlist"
                    entityId={pl.id}
                    artworkFrame={pl.artworkFrame}
                    onPlay={() => navigate(`/playlist/${pl.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {showFavorites &&
            (favorites.length > 0 ? (
              <section className="mb-8">
                <div className="max-w-2xl">
                  {favorites.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i + 1} queue={favorites} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
                <Heart size={18} />
                No favorites yet. Tap the heart on any song while it's playing to save it here.
              </div>
            ))}

          {q &&
            !filteredForYou.length &&
            !filteredMyPlaylists.length &&
            !filteredArtists.length &&
            !filteredAlbums.length && <p className="text-fg-muted text-sm">No results found for "{query}"</p>}
        </>
      )}

      {showCreatePlaylist && (
        <CreatePlaylistModal
          onClose={() => {
            setShowCreatePlaylist(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
