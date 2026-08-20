// Central registry of route chunk loaders. App.tsx feeds each of these into
// `lazy()`; prefetchRoute.ts feeds the same functions on touch/hover intent
// against a nav target, so the chunk starts downloading before the tap/click
// that actually navigates there completes. One loader per route keeps the
// two call sites requesting the exact same dynamic import rather than two
// separately-authored ones for the same page.
export const routeLoaders = {
  albumDetail: () => import("../pages/AlbumDetail"),
  adminFeaturedBanners: () => import("../pages/AdminFeaturedBanners"),
  adminLibraryManagement: () => import("../pages/AdminLibraryManagement"),
  adminUpload: () => import("../pages/AdminUpload"),
  adminUserAccess: () => import("../pages/AdminUserAccess"),
  allConcerts: () => import("../pages/AllConcerts"),
  allPodcasts: () => import("../pages/AllPodcasts"),
  allSermons: () => import("../pages/AllSermons"),
  allSingles: () => import("../pages/AllSingles"),
  allSongs: () => import("../pages/AllSongs"),
  artistDetail: () => import("../pages/ArtistDetail"),
  concertDetail: () => import("../pages/ConcertDetail"),
  artists: () => import("../pages/Artists"),
  auth: () => import("../pages/Auth"),
  bible: () => import("../pages/Bible"),
  customArtistDetail: () => import("../pages/CustomArtistDetail"),
  library: () => import("../pages/Library"),
  playlistDetail: () => import("../pages/PlaylistDetail"),
  podcastDetail: () => import("../pages/PodcastDetail"),
  recommended: () => import("../pages/Recommended"),
  search: () => import("../pages/Search"),
  sermonDetail: () => import("../pages/SermonDetail"),
  settings: () => import("../pages/Settings"),
  telegramImport: () => import("../pages/TelegramImport"),
  youtubeCatalogImport: () => import("../pages/YoutubeCatalogImport"),
  youtubeImport: () => import("../pages/YoutubeImport"),
} as const;
