import { lazy, Suspense, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import MobileNav from "./components/MobileNav";
import PlayerBar from "./components/PlayerBar";
import SplashScreen from "./components/SplashScreen";
import Topbar from "./components/Topbar";
import { AuthProvider } from "./context/AuthContext";
import { CustomArtistsProvider } from "./context/CustomArtistsContext";
import { FavoritesProvider } from "./context/FavoritesContext";
import { LanguageProvider } from "./context/LanguageContext";
import { LyricsProvider } from "./context/LyricsContext";
import { PlayerProvider } from "./context/PlayerContext";
import { SleepTimerProvider } from "./context/SleepTimerContext";
import { ThemeProvider } from "./context/ThemeContext";
// Home is the initial route on every fresh load, so it stays a static
// import — lazy-loading it would only add an extra async hop with no
// benefit. Every other route is code-split into its own chunk so the first
// paint only ships the JS the landing page actually needs.
import Home from "./pages/Home";

const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const AdminFeaturedBanners = lazy(() => import("./pages/AdminFeaturedBanners"));
const AdminLibraryManagement = lazy(() => import("./pages/AdminLibraryManagement"));
const AdminUpload = lazy(() => import("./pages/AdminUpload"));
const AllConcerts = lazy(() => import("./pages/AllConcerts"));
const AllPodcasts = lazy(() => import("./pages/AllPodcasts"));
const AllSermons = lazy(() => import("./pages/AllSermons"));
const AllSingles = lazy(() => import("./pages/AllSingles"));
const AllSongs = lazy(() => import("./pages/AllSongs"));
const ArtistDetail = lazy(() => import("./pages/ArtistDetail"));
const ConcertDetail = lazy(() => import("./pages/ConcertDetail"));
const Artists = lazy(() => import("./pages/Artists"));
const Auth = lazy(() => import("./pages/Auth"));
const Bible = lazy(() => import("./pages/Bible"));
const CustomArtistDetail = lazy(() => import("./pages/CustomArtistDetail"));
const Library = lazy(() => import("./pages/Library"));
const PlaylistDetail = lazy(() => import("./pages/PlaylistDetail"));
const PodcastDetail = lazy(() => import("./pages/PodcastDetail"));
const Recommended = lazy(() => import("./pages/Recommended"));
const Search = lazy(() => import("./pages/Search"));
const SermonDetail = lazy(() => import("./pages/SermonDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const YoutubeCatalogImport = lazy(() => import("./pages/YoutubeCatalogImport"));
const YoutubeImport = lazy(() => import("./pages/YoutubeImport"));

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
        <Route path="/admin/library" element={<AdminLibraryManagement />} />
        <Route path="/admin/featured-banners" element={<AdminFeaturedBanners />} />
        <Route path="/admin/youtube-import" element={<YoutubeImport />} />
        <Route path="/admin/youtube-catalog-import" element={<YoutubeCatalogImport />} />
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
    <div className="h-screen w-screen flex flex-col bg-base overflow-hidden">
      <main className="relative flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-gradient-to-b from-panel to-base rounded-lg m-0 pb-48">
        <div className="aurora-bg" />
        <div className="relative z-10">
          <Topbar />
          {routes}
        </div>
      </main>
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-3 pb-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <PlayerBar />
        <MobileNav />
      </div>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <CustomArtistsProvider>
            <FavoritesProvider>
              <LyricsProvider>
                <PlayerProvider>
                  <SleepTimerProvider>
                    <HashRouter>
                      <AppShell />
                    </HashRouter>
                  </SleepTimerProvider>
                </PlayerProvider>
              </LyricsProvider>
            </FavoritesProvider>
          </CustomArtistsProvider>
        </AuthProvider>
      </LanguageProvider>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </ThemeProvider>
  );
}
