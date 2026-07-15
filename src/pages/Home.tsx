import { Bell, Flame, Heart, Music, Shuffle, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import ArtTile from "../components/home/ArtTile";
import Card from "../components/Card";
import ConcertSongTile from "../components/home/ConcertSongTile";
import ForYouCard from "../components/home/ForYouCard";
import HeroCarousel, { type HeroSlide } from "../components/home/HeroCarousel";
import QuickActionGrid, { type QuickAction } from "../components/home/QuickActionGrid";
import SectionRow from "../components/SectionRow";
import { devotionalLineOfTheDay } from "../data/devotionalLines";
import { useAuth } from "../context/useAuth";
import { useFavorites } from "../context/FavoritesContext";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { isConcertSongItem } from "../lib/concerts";
import {
  albumsApi,
  artistsApi,
  concertsApi,
  featuredBannersApi,
  playlistsApi,
  podcastsApi,
  sermonsApi,
  singlesApi,
  tracksApi,
  type ApiAlbum,
  type ApiArtist,
  type ApiFeaturedBanner,
  type ApiPlaylist,
  type ApiPodcast,
  type ApiConcertItem,
  type ApiSermon,
  type ApiTrack,
} from "../lib/api";
import { getRecentlyPlayedIds } from "../lib/recentlyPlayed";
import { buildRecommendations } from "../lib/recommendations";

function greetingKey(): "goodMorning" | "goodAfternoon" | "goodEvening" {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 18) return "goodAfternoon";
  return "goodEvening";
}

export default function Home() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { favorites } = useFavorites();
  const { currentTrack, isPlaying, playTrack, shuffle, toggleShuffle } = usePlayer();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [sermons, setSermons] = useState<ApiSermon[]>([]);
  const [podcasts, setPodcasts] = useState<ApiPodcast[]>([]);
  const [ownedPlaylists, setOwnedPlaylists] = useState<ApiPlaylist[]>([]);
  const [featuredBanners, setFeaturedBanners] = useState<ApiFeaturedBanner[]>([]);
  const [concerts, setConcerts] = useState<ApiConcertItem[]>([]);
  const [singles, setSingles] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      artistsApi.list(),
      albumsApi.list(),
      tracksApi.list(),
      sermonsApi.list(),
      podcastsApi.list(),
      featuredBannersApi.list(),
      concertsApi.list(),
      singlesApi.list(),
    ])
      .then(([ar, al, tr, se, po, fb, co, si]) => {
        setArtists(ar);
        setAlbums(al);
        setTracks(tr);
        setSermons(se);
        setPodcasts(po);
        setFeaturedBanners(fb);
        setConcerts(co);
        setSingles(si);
      })
      .finally(() => setLoading(false));
  }, []);

  // Only a personalization signal for the "For You" cards below — not
  // rendered directly, so a fetch failure/logged-out state is harmless.
  useEffect(() => {
    if (user) playlistsApi.mine().then(setOwnedPlaylists);
    else setOwnedPlaylists([]);
  }, [user]);

  const devotionalLine = useMemo(() => devotionalLineOfTheDay(), []);

  // Regular Albums/New Releases must never include Concert Albums — Concerts
  // is a dedicated category fetched separately above (concertsApi.list(),
  // see server/src/routes/concerts.ts), never derived from this list. This
  // filter is a belt-and-suspenders guard in case a "live"-tagged album ever
  // shows up in the general albums response.
  const catalogAlbums = useMemo(() => albums.filter((a) => a.albumType !== "live"), [albums]);
  // "New Releases" means newly posted to Mezmur, not the content's own
  // nominal release year — sorts by createdAt (when it was actually
  // imported) so an old recording imported today still surfaces here.
  const newReleases = useMemo(
    () =>
      [...catalogAlbums]
        .sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0))
        .slice(0, 12),
    [catalogAlbums]
  );
  const continueListening = useMemo(() => {
    const ids = getRecentlyPlayedIds();
    return ids.map((id) => tracks.find((tr) => tr.id === id)).filter((tr): tr is ApiTrack => Boolean(tr));
  }, [tracks]);
  const recommended = useMemo(
    () =>
      buildRecommendations(
        {
          artists,
          tracks,
          favoriteTracks: favorites,
          recentlyPlayedIds: getRecentlyPlayedIds(),
          ownedPlaylists,
        },
        6
      ),
    [artists, tracks, favorites, ownedPlaylists]
  );

  const playAlbum = useCallback(
    async (id: string) => {
      const full = await albumsApi.get(id);
      if (full.tracks[0]) playTrack(full.tracks[0], full.tracks);
    },
    [playTrack]
  );

  const playArtist = useCallback(
    async (id: string) => {
      const full = await artistsApi.get(id);
      if (full.topTracks[0]) playTrack(full.topTracks[0], full.topTracks);
    },
    [playTrack]
  );

  // Instantly starts a randomized queue from the whole library — no
  // confirmation, no navigation, just play. Turns shuffle mode on (if it
  // isn't already) so every subsequent skip keeps picking randomly too.
  const shufflePlay = useCallback(() => {
    if (tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    playTrack(randomTrack, tracks);
  }, [tracks, shuffle, toggleShuffle, playTrack]);

  // The Home hero carousel is a hand-curated collection (Settings -> Home
  // Featured Banner) — it never falls back to "newest" or "recently
  // imported" albums. An album only ever appears here if an admin explicitly
  // featured it; if nothing's featured, the carousel simply doesn't render
  // (see HeroCarousel's `slides.length === 0` guard).
  const heroSlides: HeroSlide[] = useMemo(
    () =>
      featuredBanners.map((banner) => ({
        id: banner.id,
        tag: banner.badgeText,
        title: banner.title,
        subtitle: banner.subtitle,
        buttonText: banner.buttonText,
        photoUrl: banner.imageUrl,
        gradient: banner.gradient,
        onOpen: () => {
          if (banner.entityType === "album") navigate(`/album/${banner.entityId}`);
        },
        onPlay: () => {
          if (banner.entityType === "album") playAlbum(banner.entityId);
        },
      })),
    [featuredBanners, navigate, playAlbum]
  );

  const quickActions: QuickAction[] = [
    { id: "trending", label: t("trending"), icon: Flame, glow: "red", onClick: () => navigate("/songs") },
    { id: "new", label: t("newReleases"), icon: Sparkles, glow: "cyan", onClick: () => navigate("/library?filter=albums") },
    { id: "favorites", label: t("favorites"), icon: Heart, glow: "brand", onClick: () => navigate("/library?filter=favorites") },
    { id: "shuffle", label: t("shuffle"), icon: Shuffle, glow: "gold", onClick: shufflePlay },
  ];

  if (loading) {
    return (
      <div className="px-5 py-6">
        <p className="text-fg-muted">{t("loading")}</p>
      </div>
    );
  }

  const hasContent = artists.length > 0 || tracks.length > 0 || albums.length > 0;

  if (!hasContent) {
    return (
      <div className="px-5 py-6">
        <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-elevated py-24 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-brand/30 to-transparent ring-2 ring-brand/40 mb-5">
            <Music size={28} className="text-brand" />
          </div>
          <p className="text-lg font-semibold text-fg mb-2">No music has been imported yet.</p>
          <p className="text-sm text-fg-muted max-w-sm">
            Go to <span className="text-fg font-medium">Admin → Import Artist Catalog</span> to add your first artist.
          </p>
        </div>
      </div>
    );
  }

  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="px-5 py-5">
      {/* Compact header: greeting + devotional line, notification, profile */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          {/* Same premium language as the buttons beside it — a soft
              brand-colored ambient glow, here behind a gently faded
              gradient fill instead of a bevel (which only reads on a
              round tile, not a line of text). */}
          <h1
            className="text-xl font-black tracking-tight leading-tight bg-gradient-to-r from-fg to-fg/65 bg-clip-text text-transparent"
            style={{ filter: "drop-shadow(0 2px 14px color-mix(in oklab, var(--color-brand) 45%, transparent))" }}
          >
            {t(greetingKey())}
          </h1>
          <p className="text-xs text-fg-muted italic mt-0.5">{devotionalLine}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            aria-label={t("notifications")}
            className="tile-glow w-10 h-10 rounded-full flex items-center justify-center ring-1 ring-white/15 text-fg-muted hover:text-fg active:scale-90 transition-all"
            style={
              {
                "--tile-glow": "color-mix(in oklab, var(--color-fg-subtle) 35%, transparent)",
                background:
                  "radial-gradient(120% 120% at 30% 22%, color-mix(in oklab, var(--color-fg) 10%, var(--color-elevated)) 0%, var(--color-elevated) 100%)",
              } as CSSProperties
            }
          >
            <Bell size={17} />
          </button>
          <button
            onClick={() => (user ? navigate("/settings") : navigate("/auth"))}
            aria-label={user ? t("settings") : t("logIn")}
            className="tile-glow w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-1 ring-white/30 active:scale-90 transition-all"
            style={
              {
                "--tile-glow": "color-mix(in oklab, var(--color-brand) 65%, transparent)",
                background:
                  "radial-gradient(120% 120% at 30% 22%, color-mix(in oklab, var(--color-brand) 40%, white) 0%, var(--color-brand) 55%, color-mix(in oklab, var(--color-accent-cyan) 70%, black) 100%)",
              } as CSSProperties
            }
          >
            {user ? initial : <User size={15} />}
          </button>
        </div>
      </div>

      <HeroCarousel slides={heroSlides} />

      <QuickActionGrid actions={quickActions} />

      {continueListening.length > 0 && (
        <SectionRow title={t("continueListening")} accent="brand" large edgeInset={20} scroll>
          {continueListening.map((track) => (
            <ArtTile
              key={track.id}
              title={track.title}
              subtitle={track.artistName}
              gradient={track.gradient}
              to={track.albumId ? `/album/${track.albumId}` : undefined}
              // No album to browse into — clicking the tile just plays it,
              // same as the play icon, instead of opening the artist page.
              onCardClick={track.albumId ? undefined : () => playTrack(track, continueListening)}
              photoUrl={track.coverUrl}
              entityType="track"
              entityId={track.id}
              artworkFrame={track.artworkFrame}
              readOnlyArtwork={Boolean(track.albumId)}
              playing={isPlaying && currentTrack?.id === track.id}
              showPlayIcon
              onPlay={() => playTrack(track, continueListening)}
            />
          ))}
        </SectionRow>
      )}

      {recommended.length > 0 && (
        <SectionRow title={t("forYou")} accent="cyan" large edgeInset={20} scroll>
          {recommended.map((item) => (
            <ForYouCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              gradient={item.gradient}
              to={item.to}
              onCardClick={item.to ? undefined : () => playTrack(item.track, recommended.map((r) => r.track))}
              photoUrl={item.photoUrl}
              onPlay={() => playTrack(item.track, recommended.map((r) => r.track))}
            />
          ))}
        </SectionRow>
      )}

      {artists.length > 0 && (
        <SectionRow title={t("artists")} onShowAll={() => navigate("/library?filter=artists")} accent="gold" large edgeInset={20} scroll>
          {artists.map((artist) => (
            <Card
              key={artist.id}
              title={artist.name}
              subtitle=""
              showSubtitle={false}
              titleClassName="text-base font-bold tracking-tight"
              gradient={artist.gradient}
              to={`/artist/${artist.id}`}
              portrait
              fullWidth
              photoUrl={artist.photoUrl}
              playing={isPlaying && currentTrack?.artistId === artist.id}
              onPlay={() => playArtist(artist.id)}
            />
          ))}
        </SectionRow>
      )}

      {catalogAlbums.length > 0 && (
        <SectionRow title={t("albums")} onShowAll={() => navigate("/library?filter=albums")} accent="red" large edgeInset={20} scroll>
          {catalogAlbums.map((album) => (
            <ArtTile
              key={album.id}
              title={album.title}
              subtitle={album.artistName}
              gradient={album.gradient}
              to={`/album/${album.id}`}
              photoUrl={album.coverUrl}
              entityType="album"
              entityId={album.id}
              artworkFrame={album.artworkFrame}
              playing={isPlaying && currentTrack?.albumId === album.id}
            />
          ))}
        </SectionRow>
      )}

      {newReleases.length > 0 && (
        <SectionRow title={t("newReleases")} onShowAll={() => navigate("/library?filter=albums")} accent="gold" large edgeInset={20} scroll>
          {newReleases.map((album) => (
            <ArtTile
              key={album.id}
              title={album.title}
              subtitle={album.artistName}
              gradient={album.gradient}
              to={`/album/${album.id}`}
              photoUrl={album.coverUrl}
              entityType="album"
              entityId={album.id}
              artworkFrame={album.artworkFrame}
              playing={isPlaying && currentTrack?.albumId === album.id}
            />
          ))}
        </SectionRow>
      )}

      {singles.length > 0 && (
        <SectionRow title={t("singles")} onShowAll={() => navigate("/singles")} accent="cyan" large edgeInset={20} scroll>
          {singles.map((track) => (
            <ArtTile
              key={track.id}
              title={track.title}
              subtitle={track.artistName}
              gradient={track.gradient}
              // A Single has no album/detail page of its own — clicking the
              // tile plays it directly instead of opening the artist profile.
              onCardClick={() => playTrack(track, singles)}
              photoUrl={track.coverUrl}
              entityType="track"
              entityId={track.id}
              artworkFrame={track.artworkFrame}
              playing={isPlaying && currentTrack?.id === track.id}
              showPlayIcon
              onPlay={() => playTrack(track, singles)}
            />
          ))}
        </SectionRow>
      )}

      {sermons.length > 0 && (
        <SectionRow title={t("sermons")} onShowAll={() => navigate("/sermons")} accent="sky" dense edgeInset={20} scroll>
          {sermons.map((sermon) => (
            <ArtTile
              key={sermon.id}
              title={sermon.title}
              subtitle={sermon.speaker}
              gradient={sermon.gradient}
              to={`/sermon/${sermon.id}`}
            />
          ))}
        </SectionRow>
      )}

      {podcasts.length > 0 && (
        <SectionRow title={t("podcasts")} onShowAll={() => navigate("/podcasts")} accent="red" dense edgeInset={20} scroll>
          {podcasts.map((podcast) => (
            <ArtTile
              key={podcast.id}
              title={podcast.title}
              subtitle={podcast.host}
              gradient={podcast.gradient}
              to={`/podcast/${podcast.id}`}
            />
          ))}
        </SectionRow>
      )}

      {/* Always shown, even with zero concerts — pinned to the very bottom
          of Home per the Concert-experience spec, unlike every other
          section above which only renders once it has content. */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="w-1 h-6 rounded-full bg-gradient-to-b from-accent-violet to-indigo-900" />
            <h2 className="font-bold tracking-tight text-2xl">{t("concerts")}</h2>
          </div>
          <button
            onClick={() => navigate("/concerts")}
            className="text-sm font-semibold text-fg-muted hover:text-brand transition-colors shrink-0"
          >
            Show all
          </button>
        </div>
        {concerts.length > 0 ? (
          <div
            className="flex overflow-x-auto overscroll-x-contain no-scrollbar gap-3 pb-1 scroll-smooth items-start"
            style={{ marginInline: "-20px", paddingInline: "20px" }}
          >
            {concerts.map((item) =>
              item.kind === "album" ? (
                <div key={item.id} className="shrink-0 w-40">
                  <ArtTile
                    title={item.title}
                    subtitle={item.artistName}
                    gradient={item.gradient}
                    to={`/concert/${item.id}`}
                    photoUrl={item.coverUrl}
                    entityType="album"
                    entityId={item.id}
                    artworkFrame={item.artworkFrame}
                    playing={isPlaying && currentTrack?.albumId === item.id}
                  />
                </div>
              ) : (
                // A standalone Concert Song has no tracklist/detail page —
                // tapping it plays immediately, same as a Single's tile.
                <div key={item.id} className="shrink-0 w-28">
                  <ConcertSongTile
                    title={item.title}
                    subtitle={item.artistName}
                    gradient={item.gradient}
                    photoUrl={item.coverUrl}
                    entityId={item.id}
                    artworkFrame={item.artworkFrame}
                    playing={isPlaying && currentTrack?.id === item.id}
                    onPlay={() => playTrack(item, concerts.filter(isConcertSongItem))}
                  />
                </div>
              )
            )}
          </div>
        ) : (
          <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4">No concerts available yet.</div>
        )}
      </section>
    </div>
  );
}
