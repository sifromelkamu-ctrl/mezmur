import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { routeLoaders } from "./lib/routeLoaders";

const Auth = lazy(routeLoaders.auth);
const AdminAnalytics = lazy(routeLoaders.adminAnalytics);
const AdminArtworkStudio = lazy(routeLoaders.adminArtworkStudio);
const AdminAuditLog = lazy(routeLoaders.adminAuditLog);
const AdminContactMessages = lazy(routeLoaders.adminContactMessages);
const AdminDashboard = lazy(routeLoaders.adminDashboard);
const AdminFeaturedBanners = lazy(routeLoaders.adminFeaturedBanners);
const AdminLibraryManagement = lazy(routeLoaders.adminLibraryManagement);
const AdminMediaMigration = lazy(routeLoaders.adminMediaMigration);
const AdminMusicCatalog = lazy(routeLoaders.adminMusicCatalog);
const AdminSubmissions = lazy(routeLoaders.adminSubmissions);
const AdminSystemHealth = lazy(routeLoaders.adminSystemHealth);
const AdminUpload = lazy(routeLoaders.adminUpload);
const AdminUserAccess = lazy(routeLoaders.adminUserAccess);
const YoutubeImport = lazy(routeLoaders.youtubeImport);
const YoutubeCatalogImport = lazy(routeLoaders.youtubeCatalogImport);
const TelegramImport = lazy(routeLoaders.telegramImport);

// The genuinely separate "Mezmur Admin" website (its own Vercel project,
// its own domain, no # in the URL) — see admin-main.tsx for the entry
// point and vite.admin.config.ts for the build that produces it. Every
// route here is the exact same lazy-loaded page component App.tsx's
// /admin/* routes already use; only the wrapper is different:
// BrowserRouter instead of HashRouter (fine here — unlike the listener
// app, this is never bundled into the Capacitor native shell, which is the
// reason App.tsx is stuck on HashRouter in the first place), and only the
// two providers any admin page actually needs (Theme, Auth) instead of the
// listener app's full provider stack (player, favorites, Bible audio,
// subscriptions, ...), none of which any admin page touches.
//
// Routes keep their "/admin" prefix even though this whole site IS the
// admin site, deliberately — every Link/navigate("/admin/...") already
// written across AdminSidebar/AdminTopbar/AdminDashboard/AdminMusicCatalog
// stays correct unchanged, rather than rewriting ~15 hardcoded paths for a
// cosmetic difference.
export default function AdminApp() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/login" element={<Auth />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/catalog" element={<AdminMusicCatalog />} />
              <Route path="/admin/audit-log" element={<AdminAuditLog />} />
              <Route path="/admin/artwork-studio" element={<AdminArtworkStudio />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/system-health" element={<AdminSystemHealth />} />
              <Route path="/admin/upload" element={<AdminUpload />} />
              <Route path="/admin/user-access" element={<AdminUserAccess />} />
              <Route path="/admin/contact-messages" element={<AdminContactMessages />} />
              <Route path="/admin/submissions" element={<AdminSubmissions />} />
              <Route path="/admin/library" element={<AdminLibraryManagement />} />
              <Route path="/admin/media-migration" element={<AdminMediaMigration />} />
              <Route path="/admin/featured-banners" element={<AdminFeaturedBanners />} />
              <Route path="/admin/youtube-import" element={<YoutubeImport />} />
              <Route path="/admin/youtube-catalog-import" element={<YoutubeCatalogImport />} />
              <Route path="/admin/telegram-import" element={<TelegramImport />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
