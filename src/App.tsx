import { lazy, Suspense, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import BibleAudioBar from "./components/BibleAudioBar";
import MobileNav from "./components/MobileNav";
import PlayerBar from "./components/PlayerBar";
import PreviewPaywallModal from "./components/PreviewPaywallModal";
import SplashScreen from "./components/SplashScreen";
import Topbar from "./components/Topbar";
import { AuthProvider } from "./context/AuthContext";
import { BibleAudioProvider } from "./context/BibleAudioContext";
import { CustomArtistsProvider } from "./context/CustomArtistsContext";
import { FavoritesProvider } from "./context/FavoritesContext";
import { LanguageProvider } from "./context/LanguageContext";
import { LyricsProvider } from "./context/LyricsContext";
import { PlayerProvider } from "./context/PlayerContext";
import { SleepTimerProvider } from "./context/SleepTimerContext";
import { SubscriptionProvider } from "./context/SubscriptionContext";
import { ThemeProvider } from "./context/ThemeContext";
import { routeLoaders } from "./lib/routeLoaders";
// Home is the initial route on every fresh load, so it stays a static
// import — lazy-loading it would only add an extra async hop with no
// benefit. Every other route is code-split into its own chunk so the first
// paint only ships the JS the landing page actually needs.
import Home from "./pages/Home";

// Each loader is shared with prefetchRoute.ts (see routeLoaders.ts) so a
// touch/hover against a nav target requests the exact same dynamic import.
const AlbumDetail = lazy(routeLoaders.albumDetail);
const AdminFeaturedBanners = lazy(routeLoaders.adminFeaturedBanners);
const AdminLibraryManagement = lazy(routeLoaders.adminLibraryManagement);
const AdminUpload = lazy(routeLoaders.adminUpload);
const AdminUserAccess = lazy(routeLoaders.adminUserAccess);
const AdminContactMessages = lazy(routeLoaders.adminContactMessages);
const AllConcerts = lazy(routeLoaders.allConcerts);
const AllPodcasts = lazy(routeLoaders.allPodcasts);
const AllSermons = lazy(routeLoaders.allSermons);
const AllSingles = lazy(routeLoaders.allSingles);
const AllSongs = lazy(routeLoaders.allSongs);
const ArtistDetail = lazy(routeLoaders.artistDetail);
const ConcertDetail = lazy(routeLoaders.concertDetail);
const Artists = lazy(routeLoaders.artists);
const Auth = lazy(routeLoaders.auth);
const Bible = lazy(routeLoaders.bible);
const CustomArtistDetail = lazy(routeLoaders.customArtistDetail);
const Library = lazy(routeLoaders.library);
const PlaylistDetail = lazy(routeLoaders.playlistDetail);
const PodcastDetail = lazy(routeLoaders.podcastDetail);
const Recommended = lazy(routeLoaders.recommended);
const Search = lazy(routeLoaders.search);
const SermonDetail = lazy(routeLoaders.sermonDetail);
const Settings = lazy(routeLoaders.settings);
const TelegramImport = lazy(routeLoaders.telegramImport);
const YoutubeCatalogImport = lazy(routeLoaders.youtubeCatalogImport);
const YoutubeImport = lazy(routeLoaders.youtubeImport);

// /auth is a full-screen, immersive flow (like Spotify/Apple Music's own
// sign-in) — it deliberately renders without the persistent Topbar/
// PlayerBar/MobileNav chrome that every other route gets.
function AppShell() {
  const location = useLocation();
  const isAuthRoute = location.pathname === "/auth";

  const routes = (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/artists" element={<Artists />} />
        <Route path="/search" element={<Search />} />
        <Route path="/library" element={<Library />} />
        <Route path="/sermons" element={<AllSermons />} />
        <Route path="/podcasts" element={<AllPodcasts />} />
        <Route path="/concerts" element={<AllConcerts />} />
        <Route path="/singles" element={<AllSingles />} />
        <Route path="/songs" element={<AllSongs />} />
        <Route path="/recommended" element={<Recommended />} />
        <Route path="/bible" element={<Bible />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/admin/upload" element={<AdminUpload />} />
        <Route path="/admin/user-access" element={<AdminUserAccess />} />
        <Route path="/admin/contact-messages" element={<AdminContactMessages />} />
        <Route path="/admin/library" element={<AdminLibraryManagement />} />
        <Route path="/admin/featured-banners" element={<AdminFeaturedBanners />} />
        <Route path="/admin/youtube-import" element={<YoutubeImport />} />
        <Route path="/admin/youtube-catalog-import" element={<YoutubeCatalogImport />} />
        <Route path="/admin/telegram-import" element={<TelegramImport />} />
        <Route path="/playlist/:id" element={<PlaylistDetail />} />
        <Route path="/album/:id" element={<AlbumDetail />} />
        {/* Its own dedicated page (not AlbumDetail) — a Concert is still an
            Album row under the hood (albumType "live"), but the detail page
            now has concert-only UI (the horizontal concert switcher,
            Like/Download/Share) that a regular Album page must never grow. */}
        <Route path="/concert/:id" element={<ConcertDetail />} />
        <Route path="/artist/:id" element={<ArtistDetail />} />
        <Route path="/my-artist/:id" element={<CustomArtistDetail />} />
        <Route path="/sermon/:id" element={<SermonDetail />} />
        <Route path="/podcast/:id" element={<PodcastDetail />} />
      </Routes>
    </Suspense>
  );

  if (isAuthRoute) {
    return <div className="h-dvh w-screen bg-base overflow-hidden">{routes}</div>;
  }

  return (
    <div className="h-dvh w-screen flex flex-col bg-base overflow-hidden">
      <main
        className="relative flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-gradient-to-b from-panel to-base rounded-lg m-0 pb-48"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="aurora-bg" />
        <div className="relative z-10">
          <Topbar />
          {routes}
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-30">
        {/* One continuous frosted zone spanning the whole bottom band, edge
            to edge — covers the corner slivers beside the nav pill (its own
            side margins/rounding otherwise leave scrolling content peeking
            through there) and the safe-area gap below it, not just a patch
            directly under the pill. Faded in via a top-to-bottom mask
            instead of a hard blur edge, so it reads as a soft graduated
            vignette — the same look as Apple Music's mini-player backdrop —
            rather than a rectangle dropped on top of the page. */}
        <div
          className="absolute inset-0 backdrop-blur-xl pointer-events-none"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 45%)",
            maskImage: "linear-gradient(to bottom, transparent, black 45%)",
            background:
              "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--color-base) 60%, transparent) 45%)",
          }}
        />
        <div
          className="relative flex flex-col gap-2 px-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) - 10px)" }}
        >
          <PlayerBar />
          <BibleAudioBar />
          <MobileNav />
        </div>
      </div>
      <PreviewPaywallModal />
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <CustomArtistsProvider>
              <FavoritesProvider>
                <LyricsProvider>
                  <PlayerProvider>
                    <BibleAudioProvider>
                      <SleepTimerProvider>
                        <HashRouter>
                          <AppShell />
                        </HashRouter>
                      </SleepTimerProvider>
                    </BibleAudioProvider>
                  </PlayerProvider>
                </LyricsProvider>
              </FavoritesProvider>
            </CustomArtistsProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </LanguageProvider>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </ThemeProvider>
  );
}
