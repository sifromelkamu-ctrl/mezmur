export type Language = "en" | "am";

export const LANGUAGES: { id: Language; name: string; nativeName: string }[] = [
  { id: "en", name: "English", nativeName: "English" },
  { id: "am", name: "Amharic", nativeName: "አማርኛ" },
];

const dict = {
  home: { en: "Home", am: "መነሻ" },
  artists: { en: "Artists", am: "አርቲስቶች" },
  search: { en: "Search", am: "ፈልግ" },
  yourLibrary: { en: "Your Library", am: "ቤተ-መጻሕፍትዎ" },
  settings: { en: "Settings", am: "ቅንብሮች" },
  createPlaylist: { en: "Create Playlist", am: "ፕሌይሊስት ፍጠር" },
  likedSongs: { en: "Liked Songs", am: "የወደድኳቸው ዘፈኖች" },
  all: { en: "All", am: "ሁሉም" },
  playlists: { en: "Playlists", am: "ፕሌይሊስቶች" },
  signUp: { en: "Sign up", am: "ይመዝገቡ" },
  logIn: { en: "Log in", am: "ግባ" },
  logOut: { en: "Log out", am: "ውጣ" },
  upgrade: { en: "Upgrade", am: "አሻሽል" },
  goodMorning: { en: "Good morning", am: "እንደምን አደሩ" },
  goodAfternoon: { en: "Good afternoon", am: "እንደምን ዋሉ" },
  goodEvening: { en: "Good evening", am: "እንደምን አመሹ" },
  welcomeToMezmur: { en: "Welcome to Mezmur", am: "እንኳን ወደ መዝሙር በደህና መጡ" },
  showAll: { en: "Show all", am: "ሁሉንም አሳይ" },
  whatDoYouWantToListenTo: { en: "What do you want to listen to?", am: "ምን መስማት ይፈልጋሉ?" },
  browseAll: { en: "Browse all", am: "ሁሉንም ያስሱ" },
  loading: { en: "Loading...", am: "እየጫነ ነው..." },
  sermons: { en: "Sermons", am: "ስብከቶች" },
  podcasts: { en: "Podcasts", am: "ፖድካስቶች" },
  concerts: { en: "Concerts", am: "ኮንሰርቶች" },
  concert: { en: "Concert", am: "ኮንሰርት" },
  recommendedForYou: { en: "Recommended for You", am: "ለእርስዎ የተመከሩ" },
  shufflePlay: { en: "Shuffle Play", am: "በዘፈቀደ አጫውት" },
  shuffle: { en: "Shuffle", am: "ቅልቅል" },
  createPersonalizedPlaylist: { en: "Create a personalized playlist", am: "የግል ፕሌይሊስት ይፍጠሩ" },
  playlistName: { en: "Playlist name", am: "የፕሌይሊስት ስም" },
  create: { en: "Create", am: "ፍጠር" },
  cancel: { en: "Cancel", am: "ይቅር" },
  searchYourLibrary: { en: "Search your library", am: "ቤተ-መጻሕፍትዎን ይፈልጉ" },
  songs: { en: "Songs", am: "ዘፈኖች" },
  albums: { en: "Albums", am: "አልበሞች" },
  searching: { en: "Searching...", am: "በመፈለግ ላይ..." },
  noResultsFor: { en: "No results found for", am: "ምንም ውጤት አልተገኘም ለ" },
  trending: { en: "Trending", am: "ትኩስ" },
  newReleases: { en: "New Releases", am: "አዲስ ዝርያዎች" },
  favorites: { en: "Favorites", am: "ተወዳጆች" },
  mixForYou: { en: "Mix For You", am: "ለእርስዎ ድብልቅ" },
  continueListening: { en: "Continue Listening", am: "ማዳመጥ ይቀጥሉ" },
  forYou: { en: "For You", am: "ለእርስዎ" },
  singles: { en: "Singles", am: "ነጠላ ዘፈኖች" },
  notifications: { en: "Notifications", am: "ማሳወቂያዎች" },
} as const;

export type TranslationKey = keyof typeof dict;

export function translate(key: TranslationKey, language: Language): string {
  return dict[key][language] ?? dict[key].en;
}
