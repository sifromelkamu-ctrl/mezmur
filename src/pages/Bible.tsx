import {
  Bell,
  Book,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  Copy,
  Heart,
  Highlighter,
  Image as ImageIcon,
  Leaf,
  Loader2,
  Pause,
  Search,
  Settings2,
  Share2,
  StickyNote,
  Sun,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { BIBLE_BOOKS, type BibleBookMeta } from "../data/bibleBooks";
import { useAuth } from "../context/useAuth";
import { useTheme } from "../context/ThemeContext";
import BibleBookmarksModal, { type BookmarkEntry } from "../components/bible/BibleBookmarksModal";
import BibleCompareModal from "../components/bible/BibleCompareModal";
import BibleFavoritesModal, { type FavoriteEntry } from "../components/bible/BibleFavoritesModal";
import BibleHistoryModal, { type HistoryEntry } from "../components/bible/BibleHistoryModal";
import BibleNotesModal, { type NoteEntry } from "../components/bible/BibleNotesModal";
import BibleSettingsModal from "../components/bible/BibleSettingsModal";
import VerseImageComposer from "../components/bible/VerseImageComposer";
import NotificationsPanel from "../components/home/NotificationsPanel";
import TextAreaField from "../components/form/TextAreaField";
import TextField from "../components/form/TextField";
import { HERO_IMAGES } from "../data/bibleHeroImages";
import { MORNING_VERSES } from "../data/morningVerses";
import { BOTTOM_RESERVE_PX } from "../lib/layout";
import { isDailyVerseSubscribed, pushSupported, subscribeToDailyVerse, unsubscribeFromDailyVerse } from "../lib/pushNotifications";
import {
  getAllAnnotations,
  HIGHLIGHT_COLORS,
  loadChapterAnnotations,
  parseVerseKey,
  setFavorite,
  setHighlight,
  setNote,
  verseKey,
  type HighlightColor,
  type VerseAnnotation,
} from "../utils/bibleAnnotations";
import {
  ENGLISH_FONT_FAMILY_CLASSES,
  ENGLISH_VERSION_LABELS,
  ENGLISH_VERSION_OPTIONS,
  FONT_FAMILY_CLASSES,
  FONT_SIZE_CLASSES,
  loadReadingPrefs,
  saveReadingPrefs,
  type FontSize,
  type ReadingPrefs,
} from "../utils/bibleReadingPrefs";
import { getReadChapterKeys, getRecentHistory, recordChapterRead } from "../utils/bibleReadingHistory";
import { onBibleNavAction } from "../lib/bibleNavEvents";
import { speechSupported, useBibleAudio } from "../context/BibleAudioContext";
import { usePlayer } from "../context/PlayerContext";
import { tracksApi } from "../lib/api";

type BookText = Record<string, string[]>; // chapter number -> verses

// Amharic name in "am" mode (the app's default, matching every existing
// user's current experience unchanged); English name in "en" mode, where
// public/bible/en/<slug>.json (King James Version — public domain, no
// licensing restriction) is the text actually being read.
function bookDisplayName(book: BibleBookMeta, language: "am" | "en"): string {
  return language === "en" ? book.name : book.nameAm;
}

// Formats a sorted list of 0-based verse indices as 1-based verse numbers
// for a citation, collapsing contiguous runs into ranges (e.g. selecting
// verses 3-5 and 8 and 10-11 reads "3-5,8,10-11") rather than every verse
// spelled out individually — matches how a citation is normally written.
function formatVerseNumbers(sortedIndices: number[]): string {
  const parts: string[] = [];
  let start = sortedIndices[0];
  let prev = sortedIndices[0];
  for (let idx = 1; idx <= sortedIndices.length; idx++) {
    const current = sortedIndices[idx];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    start = current;
    prev = current;
  }
  return parts.join(",");
}

const WORD_ART_TITLE =
  "bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent drop-shadow-[0_1px_12px_rgba(242,183,5,0.35)]";

// The Bible *home* screen (only) renders in its own purple/green palette,
// independent of the app's global dark/gold theme — set as inline CSS
// custom properties (rather than a stylesheet rule) so it always wins
// regardless of :root.light, with zero cascade fighting. Every other Bible
// view (chapter reader, book picker, search) is unaffected and keeps the
// app's usual dark/gold theming. Unlike the rest of this screen, it DOES
// still follow the app's light/dark toggle — two variants below, picked at
// render time — since a purple/green home screen that stayed light while
// every other tab went dark read as broken, not "on-brand".
const BIBLE_HOME_THEME_LIGHT = {
  // Cream-toned, matching the same brightened surface tokens every other
  // page uses (see :root.light in index.css) — was a lavender-white before,
  // which read as a different, colder page than the rest of the app.
  "--color-base": "#ECE7DC",
  "--color-panel": "#E8E3D6",
  "--color-elevated": "#F5F1E9",
  "--color-elevated-hover": "#DFD8C8",
  "--color-fg": "#1C1B29",
  "--color-fg-muted": "#6B7280",
  "--color-fg-subtle": "#9CA3AF",
  "--color-border": "rgba(107, 94, 74, 0.16)",
  "--color-hover": "rgba(91,63,224,0.06)",
  "--color-hover-strong": "rgba(91,63,224,0.12)",
  "--bible-purple": "#5B3FE0",
  "--bible-purple-soft": "#EDE9FB",
  "--bible-navy": "#241C3D",
  "--bible-text": "#241C3D",
  "--bible-green": "#2F9E6E",
  "--bible-green-soft": "#E3F5EC",
  // Two more accents in the same family (one per light/dark pair below),
  // so Quick Access can give each of its four actions its own color
  // instead of all four sharing one gold tint — same system the
  // category tiles already use, just extended.
  "--bible-blue": "#2E6FA7",
  "--bible-blue-soft": "#E2EEF7",
  "--bible-rose": "#C13B55",
  "--bible-rose-soft": "#FBE7EA",
} as CSSProperties;

const BIBLE_HOME_THEME_DARK = {
  // Neutral 20%-gray family for the base surfaces (not purple-tinted), so
  // the purple/green accents on top (badges, card tints, buttons) stay the
  // only source of color/brand identity instead of competing with a tinted
  // background.
  "--color-base": "#333333",
  "--color-panel": "#2E2E2E",
  "--color-elevated": "#424242",
  "--color-elevated-hover": "#4D4D4D",
  "--color-fg": "#F5F1E9",
  "--color-fg-muted": "#B0A8C0",
  "--color-fg-subtle": "#847C93",
  "--color-border": "rgba(255, 255, 255, 0.08)",
  "--color-hover": "rgba(255, 255, 255, 0.05)",
  "--color-hover-strong": "rgba(255, 255, 255, 0.1)",
  "--bible-purple": "#8B6CFF",
  "--bible-purple-soft": "#2A2140",
  "--bible-navy": "#241C3D",
  "--bible-text": "#F5F1E9",
  "--bible-green": "#3DDB96",
  "--bible-green-soft": "#182A20",
  "--bible-blue": "#6FA8DC",
  "--bible-blue-soft": "#1C2B38",
  "--bible-rose": "#FF7A90",
  "--bible-rose-soft": "#3A1E22",
} as CSSProperties;

// Well-mixed 32-bit integer hash (Murmur3-style finalizer) — unlike a plain
// polynomial string hash, this scrambles even sequential inputs thoroughly,
// so consecutive calendar days don't land on adjacent MORNING_VERSES indices
// (a plain `hash*31+char` string hash was verified to do exactly that: 9
// days in a row picking indices 74,75,76...82 before jumping at the month
// boundary — visibly "walking" instead of shuffling).
function mix32(n: number): number {
  let x = n;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

// Picks a single index into MORNING_VERSES (0..364) for a given date, keyed
// off the LOCAL calendar day (via Date.UTC on the local y/m/d fields, purely
// to get a clean integer that changes exactly at each visitor's own
// midnight) so it rotates with no server-side scheduling. This is the
// GLOBAL daily verse shown on the in-app hero card — the push notification
// uses a separate, per-user-salted pick instead (see dailyVerseIndexForUser
// in server/src/push.ts, which shares this same mixing approach).
function dailyVerseIndexFor(date: Date): number {
  const dayNumber = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  return mix32(dayNumber) % MORNING_VERSES.length;
}

// The hero photo rotates daily too, independently of which verse is shown —
// a separate salted hash so the two don't cycle in lockstep.
function dailyHeroImageIndexFor(date: Date): number {
  const dayKey = `img:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
  return hash % HERO_IMAGES.length;
}

// Picks `count` books out of all 66 for the Books carousel, reshuffled
// once per calendar day (same mix32 day-seeding dailyVerseIndexFor uses,
// salted differently so the two don't cycle together) rather than a fixed
// handful forever — the row only fits so many at once, but which books
// land in it changes daily, so most of the 66 surface over time instead
// of the same 7 every single day.
function dailyBookSlugsFor(date: Date, count: number): string[] {
  const daySeed = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  return [...BIBLE_BOOKS]
    .map((b, i) => ({ slug: b.slug, rank: mix32(daySeed * 131 + i * 977) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map((b) => b.slug);
}

// A thematically-chosen cover photo for every one of the 66 books (not
// just a curated handful) — the 7 with their own `/bible/books/` photo
// were each picked to directly evoke that specific book (light through
// trees for Genesis' creation, a shepherd's flock for Psalms, scripture
// by candlelight for Proverbs' wisdom, a dove for John, a fishing boat
// for Matthew calling fishermen, literal Roman ruins for Romans, a
// dramatic sky for Revelation). Every other book reuses the closest fit
// already in HERO_IMAGES by theme/genre (e.g. wilderness photos for the
// wandering-in-the-desert books, a storm for Jonah, ancient
// Jerusalem for the kingdom-history books, a scroll for the epistles)
// rather than one generic photo repeated 59 times. `position` overrides
// the default center crop for photos whose subject sits low in frame.
const BOOK_COVER_PHOTOS: Record<string, { src: string; position?: string }> = {
  // Pentateuch
  genesis: { src: "/bible/books/genesis.jpg" },
  exodus: { src: "/bible/hero/desert-dunes-sunset.jpg" },
  leviticus: { src: "/bible/hero/ancient-papyrus-scroll.jpg" },
  numbers: { src: "/bible/hero/desert-night-milkyway.jpg" },
  deuteronomy: { src: "/bible/hero/rocky-desert-storm.jpg" },
  // Historical books
  joshua: { src: "/bible/hero/jerusalem-old-city.jpg" },
  judges: { src: "/bible/hero/rocky-desert-storm.jpg" },
  ruth: { src: "/bible/hero/wheat-sheaves-harvest.jpg" },
  "1-samuel": { src: "/bible/hero/shepherd-staff-rural.jpg" },
  "2-samuel": { src: "/bible/hero/jerusalem-old-city.jpg" },
  "1-kings": { src: "/bible/hero/church-wooden-doors-carved.jpg" },
  "2-kings": { src: "/bible/hero/jerusalem-old-city.jpg" },
  "1-chronicles": { src: "/bible/hero/ancient-papyrus-scroll.jpg" },
  "2-chronicles": { src: "/bible/hero/church-interior-wooden-pews.jpg" },
  ezra: { src: "/bible/hero/ancient-papyrus-scroll.jpg" },
  nehemiah: { src: "/bible/hero/jerusalem-old-city.jpg" },
  esther: { src: "/bible/hero/candlelight-vigil-street.jpg" },
  // Wisdom / poetry
  job: { src: "/bible/hero/lightning-purple-sky.jpg" },
  psalms: { src: "/bible/books/psalms.jpg", position: "center 85%" },
  proverbs: { src: "/bible/books/proverbs.jpg" },
  ecclesiastes: { src: "/bible/hero/window-light-curtain-room.jpg" },
  "song-of-solomon": { src: "/bible/hero/pink-dahlias-garden.jpg" },
  // Major prophets
  isaiah: { src: "/bible/hero/dramatic-sunrise-clouds.jpg" },
  jeremiah: { src: "/bible/hero/rain-window-bokeh.jpg" },
  lamentations: { src: "/bible/hero/misty-autumn-path.jpg" },
  ezekiel: { src: "/bible/hero/aurora-norway.jpg" },
  daniel: { src: "/bible/hero/starry-night-galaxy.jpg" },
  // Minor prophets
  hosea: { src: "/bible/hero/wheat-field-sunrise-poland.jpg" },
  joel: { src: "/bible/hero/rocky-desert-storm.jpg" },
  amos: { src: "/bible/hero/golden-wheat-closeup-summer.jpg" },
  obadiah: { src: "/bible/hero/mountain-cross-sunrise.jpg" },
  jonah: { src: "/bible/hero/ocean-waves-rocks.jpg" },
  micah: { src: "/bible/hero/rolling-green-hills-sky.jpg" },
  nahum: { src: "/bible/hero/lightning-purple-sky.jpg" },
  habakkuk: { src: "/bible/hero/misty-mountain-valley.jpg" },
  zephaniah: { src: "/bible/hero/dramatic-sunrise-clouds.jpg" },
  haggai: { src: "/bible/hero/church-wooden-doors-carved.jpg" },
  zechariah: { src: "/bible/hero/starry-night-galaxy.jpg" },
  malachi: { src: "/bible/hero/golden-sunset-sky.jpg" },
  // Gospels
  matthew: { src: "/bible/books/matthew.jpg", position: "center 90%" },
  mark: { src: "/bible/hero/fishermen-nets-sunrise-sea.jpg" },
  luke: { src: "/bible/hero/praying-silhouette-sunset.jpg" },
  john: { src: "/bible/books/john.jpg" },
  // Acts
  acts: { src: "/bible/hero/olive-grove-mediterranean.jpg" },
  // Pauline epistles
  romans: { src: "/bible/books/romans.jpg" },
  "1-corinthians": { src: "/bible/hero/ancient-papyrus-scroll.jpg" },
  "2-corinthians": { src: "/bible/hero/coastline-waves-cliffs.jpg" },
  galatians: { src: "/bible/hero/rolling-green-hills-sky.jpg" },
  ephesians: { src: "/bible/hero/stained-glass-cathedral.jpg" },
  philippians: { src: "/bible/hero/candle-flame-dark.jpg" },
  colossians: { src: "/bible/hero/forest-canopy-rays.jpg" },
  "1-thessalonians": { src: "/bible/hero/starry-night-galaxy.jpg" },
  "2-thessalonians": { src: "/bible/hero/dramatic-sunrise-clouds.jpg" },
  // Pastoral epistles
  "1-timothy": { src: "/bible/hero/hands-holding-bible.jpg" },
  "2-timothy": { src: "/bible/hero/candle-flame-dark.jpg" },
  titus: { src: "/bible/hero/church-interior-wooden-pews.jpg" },
  philemon: { src: "/bible/hero/hand-reaching-sunlight.jpg" },
  // General epistles
  hebrews: { src: "/bible/hero/church-wooden-doors-carved.jpg" },
  james: { src: "/bible/hero/wheat-stalks-bundle-ribbon.jpg" },
  "1-peter": { src: "/bible/hero/lighthouse-storm.jpg" },
  "2-peter": { src: "/bible/hero/starry-night-galaxy.jpg" },
  "1-john": { src: "/bible/hero/dove-earth-olive-branch.jpg" },
  "2-john": { src: "/bible/hero/hands-holding-bible.jpg" },
  "3-john": { src: "/bible/hero/hands-holding-bible.jpg" },
  jude: { src: "/bible/hero/lightning-purple-sky.jpg" },
  // Apocalyptic
  revelation: { src: "/bible/books/revelation.jpg" },
};

export default function Bible() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode, setMode } = useTheme();
  const bibleHomeTheme = mode === "light" ? BIBLE_HOME_THEME_LIGHT : BIBLE_HOME_THEME_DARK;
  const [bookSlug, setBookSlug] = useState<string | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [bookText, setBookText] = useState<BookText | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  // Chapter audio/text-to-speech lives in a top-level context now, not local
  // state — it needs to keep playing after this page unmounts (see
  // BibleAudioContext.tsx's own comment).
  const bibleAudio = useBibleAudio();
  // For the "Audio" category tile's shuffle-music action — the main song
  // player, not Bible audio. Bible.tsx has never needed this before.
  const { shuffle, toggleShuffle, playTrack } = usePlayer();
  // Which testament's book list is open, if any — mutually exclusive
  // (opening one closes the other) rather than two independent booleans,
  // so only one book list is ever visible at a time.
  const [expandedTestament, setExpandedTestament] = useState<"old" | "new" | null>(null);

  const [annotations, setAnnotations] = useState<Record<string, VerseAnnotation>>({});
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [editingNoteVerse, setEditingNoteVerse] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [justCopied, setJustCopied] = useState(false);
  const [justShared, setJustShared] = useState(false);
  const [showHighlightColors, setShowHighlightColors] = useState(false);
  const [verseImageComposer, setVerseImageComposer] = useState<{ text: string; citation: string } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => loadReadingPrefs());
  const [showSettings, setShowSettings] = useState(false);
  const [showBibleSettings, setShowBibleSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [heroVerse, setHeroVerse] = useState<
    { id: string; ref: string; text: string; slug: string; chapter: number; verseIndex: number } | null
  >(null);
  const [heroShared, setHeroShared] = useState(false);
  const [heroImageIndex, setHeroImageIndex] = useState(() => dailyHeroImageIndexFor(new Date()));
  const heroTouchStartX = useRef<number | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [activeModal, setActiveModal] = useState<"bookmarks" | "notes" | "favorites" | "history" | null>(null);

  const [showBookSearch, setShowBookSearch] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"chapter" | "book" | "bible">("book");
  const [jumpToVerse, setJumpToVerse] = useState<number | null>(null);
  const [wholeBibleResults, setWholeBibleResults] = useState<
    { bookSlug: string; chapter: number; verseIndex: number; text: string }[]
  >([]);
  const [wholeBibleLoading, setWholeBibleLoading] = useState(false);
  const wholeBibleCacheRef = useRef<Map<string, BookText | null>>(new Map());
  const verseRefs = useRef<Record<number, HTMLParagraphElement | null>>({});

  // BibleModeNav (App.tsx) has no sub-routes to navigate to for any of
  // this — see bibleNavEvents.ts's own comment — so its non-"back to
  // Mezmur" buttons each just drive this page's own existing view state
  // directly, the same as if the equivalent in-page button had been
  // tapped. "ot"/"nt" land on the exact same real Old/New Testament
  // progress + book list that ReadingPlanCard/BookList already render
  // on this page — this just surfaces it from the bottom bar too.
  useEffect(() => {
    return onBibleNavAction((action) => {
      switch (action) {
        case "home":
          setBookSlug(null);
          setChapter(null);
          setShowBookSearch(false);
          setActiveModal(null);
          setExpandedTestament(null);
          break;
        case "ot":
          setBookSlug(null);
          setChapter(null);
          setShowBookSearch(false);
          setActiveModal(null);
          setExpandedTestament("old");
          break;
        case "nt":
          setBookSlug(null);
          setChapter(null);
          setShowBookSearch(false);
          setActiveModal(null);
          setExpandedTestament("new");
          break;
        case "settings":
          setShowBibleSettings(true);
          break;
      }
    });
  }, []);

  const book = BIBLE_BOOKS.find((b) => b.slug === bookSlug) ?? null;
  const verses = chapter ? bookText?.[chapter] : undefined;

  // 14 of the 66 books, reshuffled daily (dailyBookSlugsFor) — the Books
  // carousel row can't fit more than a handful at once, but which handful
  // changes each day instead of showing the same 7 forever, so most of
  // the 66 surface in rotation rather than being permanently hidden.
  // Declared here (before this component's several early `return`s below)
  // rather than down by CATEGORY_TILES — a Hook can't be called
  // conditionally, and that spot only runs on the branch that reaches the
  // final, non-early-return JSX.
  const booksOfTheDay = useMemo(() => dailyBookSlugsFor(new Date(), 14), []);

  // Search across every chapter of the currently open book — bookText already
  // holds the whole book client-side, so no extra fetching is needed. Can be
  // narrowed to just the chapter currently being read via searchScope.
  const bookSearchResults = useMemo(() => {
    const q = bookSearchQuery.trim();
    if (!bookText || q.length < 2) return [];
    const results: { chapter: number; verseIndex: number; text: string }[] = [];
    const chapterNums =
      searchScope === "chapter" && chapter ? [String(chapter)] : Object.keys(bookText);
    for (const chapterNum of chapterNums) {
      const chapterVerses = bookText[chapterNum];
      if (!chapterVerses) continue;
      chapterVerses.forEach((v, i) => {
        if (v && v.includes(q) && results.length < 40) {
          results.push({ chapter: Number(chapterNum), verseIndex: i, text: v });
        }
      });
    }
    return results.sort((a, b) => a.chapter - b.chapter);
  }, [bookText, bookSearchQuery, searchScope, chapter]);

  // Whole-Bible search — fetches every book once per language+version into a
  // ref cache (not re-fetched on later scope switches or searches), then
  // searches the in-memory cache client-side, same approach as the
  // single-book search above.
  useEffect(() => {
    if (searchScope !== "bible") return;
    const cacheKey = prefs.language === "en" ? `en:${prefs.englishVersion}` : "am";
    const cache = wholeBibleCacheRef.current;
    const missing = BIBLE_BOOKS.filter((b) => !cache.has(`${cacheKey}:${b.slug}`));
    if (missing.length === 0) return;
    let cancelled = false;
    setWholeBibleLoading(true);
    Promise.all(
      missing.map((b) => {
        const path =
          prefs.language === "en" ? `/bible/en/${prefs.englishVersion}/${b.slug}.json` : `/bible/${b.slug}.json`;
        return fetch(path)
          .then((res) => (res.ok ? (res.json() as Promise<BookText>) : null))
          .catch(() => null)
          .then((data) => cache.set(`${cacheKey}:${b.slug}`, data));
      })
    ).then(() => {
      if (!cancelled) setWholeBibleLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [searchScope, prefs.language, prefs.englishVersion]);

  useEffect(() => {
    const q = bookSearchQuery.trim();
    if (searchScope !== "bible" || q.length < 2 || wholeBibleLoading) {
      setWholeBibleResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const cacheKey = prefs.language === "en" ? `en:${prefs.englishVersion}` : "am";
    const cache = wholeBibleCacheRef.current;
    const results: { bookSlug: string; chapter: number; verseIndex: number; text: string }[] = [];
    outer: for (const b of BIBLE_BOOKS) {
      const data = cache.get(`${cacheKey}:${b.slug}`);
      if (!data) continue;
      for (const chapterNum of Object.keys(data)) {
        const chapterVerses = data[chapterNum];
        if (!chapterVerses) continue;
        for (let i = 0; i < chapterVerses.length; i++) {
          const v = chapterVerses[i];
          if (v && v.includes(q)) {
            results.push({ bookSlug: b.slug, chapter: Number(chapterNum), verseIndex: i, text: v });
            if (results.length >= 60) break outer;
          }
        }
      }
    }
    setWholeBibleResults(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSearchQuery, searchScope, wholeBibleLoading, prefs.language, prefs.englishVersion]);

  const jumpToSearchResult = (targetChapter: number, verseIndex: number) => {
    setShowBookSearch(false);
    setBookSearchQuery("");
    setJumpToVerse(verseIndex);
    setChapter(targetChapter);
  };

  const jumpToWholeBibleResult = (targetBookSlug: string, targetChapter: number, verseIndex: number) => {
    setShowBookSearch(false);
    setBookSearchQuery("");
    setBookSlug(targetBookSlug);
    setChapter(targetChapter);
    setJumpToVerse(verseIndex);
  };

  useEffect(() => {
    if (jumpToVerse === null || !verses) return;
    const el = verseRefs.current[jumpToVerse];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setSelectedVerses(new Set([jumpToVerse]));
    }
    setJumpToVerse(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToVerse, verses]);

  // Fetch the whole book once per selection+language (public/bible/<slug>.json
  // for Amharic, public/bible/en/<slug>.json for the King James Version), not
  // bundled into the app — a full Bible translation is several MB, too large
  // to ship in the JS bundle, so each book loads on demand the first time
  // it's opened (and again if the reader switches language mid-chapter).
  useEffect(() => {
    setBookText(null);
    setLoadError(false);
    if (!bookSlug) return;
    setLoading(true);
    const path = prefs.language === "en" ? `/bible/en/${prefs.englishVersion}/${bookSlug}.json` : `/bible/${bookSlug}.json`;
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: BookText) => setBookText(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug, prefs.language, prefs.englishVersion]);

  useEffect(() => {
    setSelectedVerses(new Set());
    setEditingNoteVerse(null);
    setAnnotations(bookSlug && chapter ? loadChapterAnnotations(bookSlug, chapter) : {});
    // Powers the Old/New Testament progress bars and the Recently Read row
    // on the Bible home screen — recorded the moment a chapter is opened,
    // not on some "finished reading" heuristic (there's no reliable signal
    // for that with plain scrolling text).
    if (bookSlug && chapter) recordChapterRead(bookSlug, chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  // Home screen's hero — a single "verse of the day", one per local
  // calendar day (keys off each visitor's own device clock, so it rotates
  // at their own midnight regardless of time zone). Note this is the GLOBAL
  // daily verse for the in-app hero; the push notification (bell button
  // below) sends a per-user personalized pick instead — see
  // dailyVerseIndexForUser in server/src/push.ts.
  useEffect(() => {
    let cancelled = false;
    // Roughly what fits in 3 lines of the hero card's text column at its
    // current width/font (measured, not exact — the card's line-clamp-3
    // still clips as a hard backstop if this estimate is ever off). English
    // translations run noticeably longer than the Amharic text for the same
    // verse (e.g. 1 John 4:16 is 99 characters in Amharic but 135 in KJV) —
    // a single Amharic-tuned limit made most English picks fail this check
    // on every attempt, silently leaving the *previous* (Amharic) verse on
    // screen instead of ever switching over when English was selected.
    const MAX_VERSE_CHARS = prefs.language === "en" ? 170 : 100;
    const bookCache = new Map<string, BookText | null>();

    async function fetchBook(slug: string): Promise<BookText | null> {
      if (bookCache.has(slug)) return bookCache.get(slug)!;
      const path =
        prefs.language === "en" ? `/bible/en/${prefs.englishVersion}/${slug}.json` : `/bible/${slug}.json`;
      const data = await fetch(path)
        .then((res) => (res.ok ? (res.json() as Promise<BookText>) : null))
        .catch(() => null);
      bookCache.set(slug, data);
      return data;
    }

    async function run() {
      const startIndex = dailyVerseIndexFor(new Date());
      // Walk forward through the curated list (same order for everyone that
      // day) until one fits in 3 lines — MORNING_VERSES is hand-picked, so a
      // handful of extra attempts is enough in practice.
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const pick = MORNING_VERSES[(startIndex + attempt) % MORNING_VERSES.length];
        const data = await fetchBook(pick.slug);
        const text = data?.[String(pick.chapter)]?.[pick.verseIndex];
        if (!text || text.length > MAX_VERSE_CHARS) continue;
        if (cancelled) return;
        const book = BIBLE_BOOKS.find((b) => b.slug === pick.slug);
        const ref = prefs.language === "en" && book ? `${book.name} ${pick.chapter}:${pick.verseIndex + 1}` : pick.refAm;
        setHeroVerse({
          id: `${pick.slug}-${pick.chapter}-${pick.verseIndex}`,
          ref,
          text,
          slug: pick.slug,
          chapter: pick.chapter,
          verseIndex: pick.verseIndex,
        });
        return;
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [prefs.language, prefs.englishVersion]);

  // Reflects whether THIS device already has an active daily-verse push
  // subscription, so the bell shows the right on/off state after a reload.
  useEffect(() => {
    if (!user || !pushSupported) return;
    isDailyVerseSubscribed().then(setPushSubscribed);
  }, [user]);

  const handleToggleNotifications = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!pushSupported || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromDailyVerse();
        setPushSubscribed(false);
      } else {
        await subscribeToDailyVerse();
        setPushSubscribed(true);
      }
    } catch {
      // Permission denied, browser unsupported, or a network hiccup — no
      // toast/error surface on this page, so just leave the bell state as
      // it was and let the user try again.
    } finally {
      setPushBusy(false);
    }
  };

  // Real chapter recordings only exist for Amharic (the app's default
  // reading language) — English mode uses the browser text-to-speech
  // fallback instead, same as chapters whose recording hasn't been made yet
  // (BibleAudioContext falls back automatically if the recording 404s).
  // `listening` only reflects THIS chapter — a different chapter can be
  // playing in the background (see BibleAudioBar), in which case this
  // button still reads "Listen" and starting it here takes over as the
  // active one, stopping the other.
  const listening = bibleAudio.isTarget(bookSlug ?? "", chapter ?? -1) && bibleAudio.isPlaying;

  const toggleListen = () => {
    if (!bookSlug || !chapter || !verses) return;
    bibleAudio.toggleListen({
      bookSlug,
      chapter,
      label: `${book?.name ?? bookSlug} ${chapter}`,
      language: prefs.language,
      verseText: verses.filter(Boolean).join(" "),
    });
  };

  // The "Audio" category tile — shuffles the actual song library (the
  // main player, same shufflePlay Home's own Shuffle tile uses), not
  // Bible content. Fetched on demand (this page never otherwise loads
  // tracks) rather than kept loaded just for this one occasional tap.
  const shuffleMusic = async () => {
    try {
      const allTracks = await tracksApi.list();
      if (allTracks.length === 0) return;
      if (!shuffle) toggleShuffle();
      playTrack(allTracks[Math.floor(Math.random() * allTracks.length)], allTracks);
    } catch {
      // network failure — silently ignore, matches this file's other
      // best-effort fetches (e.g. the daily-verse hero's own catch)
    }
  };

  // The "Bible" category tile — shuffles into a random book+chapter and
  // starts it playing via the same bibleAudio.toggleListen a chapter's own
  // "Listen" button uses (real recording if one exists, text-to-speech
  // otherwise — BibleAudioContext picks that, not this). Needs that
  // chapter's verse text first, so it fetches the book's JSON directly
  // rather than going through bookSlug/chapter state (this can be tapped
  // from the home screen, with no book open at all).
  const shuffleBibleAudio = async () => {
    const randomBook = BIBLE_BOOKS[Math.floor(Math.random() * BIBLE_BOOKS.length)];
    const randomChapter = Math.floor(Math.random() * randomBook.chapterCount) + 1;
    const path =
      prefs.language === "en"
        ? `/bible/en/${prefs.englishVersion}/${randomBook.slug}.json`
        : `/bible/${randomBook.slug}.json`;
    try {
      const res = await fetch(path);
      if (!res.ok) return;
      const data: BookText = await res.json();
      const chapterVerses = data[randomChapter];
      if (!chapterVerses) return;
      bibleAudio.toggleListen({
        bookSlug: randomBook.slug,
        chapter: randomChapter,
        label: `${bookDisplayName(randomBook, prefs.language)} ${randomChapter}`,
        language: prefs.language,
        verseText: chapterVerses.filter(Boolean).join(" "),
      });
    } catch {
      // network/parse failure — silently ignore, same as above
    }
  };

  const applyAnnotationUpdate = (key: string, updated: VerseAnnotation | undefined) => {
    setAnnotations((prev) => {
      const next = { ...prev };
      if (updated) next[key] = updated;
      else delete next[key];
      return next;
    });
  };

  // Applies one color to every currently selected verse at once, then closes
  // the selection bar — matches, add-then-tap-color, add-more, tap-color again.
  // A single already-that-color verse toggles off instead of re-applying.
  const handleApplyHighlight = (color: HighlightColor) => {
    if (!bookSlug || !chapter) return;
    const ids = [...selectedVerses];
    const soleVerse = ids.length === 1 ? ids[0] : null;
    ids.forEach((i) => {
      const key = verseKey(bookSlug, chapter, i);
      const current = annotations[key];
      const removeColor = soleVerse !== null && current?.color === color;
      const updated = setHighlight(key, removeColor ? null : color);
      applyAnnotationUpdate(key, updated);
    });
    setSelectedVerses(new Set());
  };

  // Feeds the Bible home screen's "Favorites" quick-access list. Mirrors
  // handleApplyHighlight's toggle rule: a lone already-favorited verse
  // un-favorites, everything else (including multi-select) favorites.
  const handleToggleFavorite = () => {
    if (!bookSlug || !chapter) return;
    const ids = [...selectedVerses];
    const soleVerse = ids.length === 1 ? ids[0] : null;
    const soleKey = soleVerse !== null ? verseKey(bookSlug, chapter, soleVerse) : null;
    const turningOn = soleKey ? !annotations[soleKey]?.favorite : true;
    ids.forEach((i) => {
      const key = verseKey(bookSlug, chapter, i);
      const updated = setFavorite(key, turningOn);
      applyAnnotationUpdate(key, updated);
    });
  };

  // Shared "quote — citation" composition every selection action (Copy,
  // Share, Image, Compare's header) uses, so a verse leaving the app always
  // identifies itself instead of pasting/sharing as anonymous text.
  const getSelectionText = (): { text: string; citation: string | null; withCitation: string; ids: number[] } | null => {
    if (!verses) return null;
    const ids = [...selectedVerses].sort((a, b) => a - b);
    const text = ids
      .map((i) => verses[i])
      .filter(Boolean)
      .join(" ");
    const citation = book ? `${bookDisplayName(book, prefs.language)} ${chapter}:${formatVerseNumbers(ids)}` : null;
    const withCitation = citation ? `“${text}” — ${citation}` : text;
    return { text, citation, withCitation, ids };
  };

  const handleCopySelected = async () => {
    const selection = getSelectionText();
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.withCitation);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  const handleShareSelected = async () => {
    const selection = getSelectionText();
    if (!selection) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: selection.withCitation });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(selection.withCitation);
      setJustShared(true);
      setTimeout(() => setJustShared(false), 1800);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  const handleImageSelected = () => {
    const selection = getSelectionText();
    if (!selection || !selection.citation) return;
    setVerseImageComposer({ text: selection.text, citation: selection.citation });
  };

  const handleSaveNote = (i: number) => {
    if (!bookSlug || !chapter) return;
    const key = verseKey(bookSlug, chapter, i);
    const updated = setNote(key, noteDraft);
    applyAnnotationUpdate(key, updated);
    setEditingNoteVerse(null);
    setNoteDraft("");
    setSelectedVerses(new Set());
  };

  const updatePrefs = (partial: Partial<ReadingPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      saveReadingPrefs(next);
      return next;
    });
  };

  // Full-page verse search within the currently open book
  if (showBookSearch && book) {
    return (
      <div
        className="bible-scope bg-base min-h-full max-w-2xl mx-auto px-6 pb-6"
        style={{
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setShowBookSearch(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0 -ml-2"
            aria-label="Close search"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <TextField
              autoFocus
              type="text"
              value={bookSearchQuery}
              onChange={(e) => setBookSearchQuery(e.target.value)}
              placeholder={
                prefs.language === "en" ? `Search in ${book.name}...` : `${book.nameAm} ውስጥ ጥቅስ ፈልግ...`
              }
              pill
              className="w-full pl-10 pr-9 py-2.5 text-[1rem]"
            />
            {bookSearchQuery && (
              <button
                onClick={() => setBookSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setSearchScope("book")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              searchScope === "book" ? "bg-white text-black" : "bg-elevated text-fg-muted hover:bg-elevated-hover"
            }`}
          >
            {prefs.language === "en" ? "Whole book" : "ጠቅላላ መጽሐፍ"}
          </button>
          <button
            onClick={() => setSearchScope("chapter")}
            disabled={!chapter}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-30 ${
              searchScope === "chapter" ? "bg-white text-black" : "bg-elevated text-fg-muted hover:bg-elevated-hover"
            }`}
          >
            {prefs.language === "en"
              ? chapter
                ? `Chapter ${chapter} only`
                : "Current chapter"
              : chapter
                ? `ምዕራፍ ${chapter} ብቻ`
                : "የአሁኑ ምዕራፍ"}
          </button>
          <button
            onClick={() => setSearchScope("bible")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              searchScope === "bible" ? "bg-white text-black" : "bg-elevated text-fg-muted hover:bg-elevated-hover"
            }`}
          >
            {prefs.language === "en" ? "Whole Bible" : "ጠቅላላ መጽሐፍ ቅዱስ"}
          </button>
        </div>

        {searchScope === "bible" ? (
          bookSearchQuery.trim().length < 2 ? (
            <p className="text-sm text-fg-muted text-center py-16">
              {prefs.language === "en" ? "Type at least 2 characters to search the whole Bible." : "ጠቅላላ መጽሐፍ ቅዱስን ለመፈለግ ቢያንስ 2 ፊደላት ይጻፉ።"}
            </p>
          ) : wholeBibleLoading ? (
            <p className="text-sm text-fg-muted text-center py-16">
              {prefs.language === "en" ? "Loading the whole Bible…" : "ጠቅላላ መጽሐፍ ቅዱስ በመጫን ላይ…"}
            </p>
          ) : wholeBibleResults.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-16">
              {prefs.language === "en" ? "No matching verses found." : "ምንም ተመሳሳይ ጥቅስ አልተገኘም።"}
            </p>
          ) : (
            <div className="space-y-2">
              {wholeBibleResults.map((r) => {
                const rBook = BIBLE_BOOKS.find((b) => b.slug === r.bookSlug);
                if (!rBook) return null;
                return (
                  <button
                    key={`${r.bookSlug}:${r.chapter}:${r.verseIndex}`}
                    onClick={() => jumpToWholeBibleResult(r.bookSlug, r.chapter, r.verseIndex)}
                    className="w-full text-left p-3 rounded-lg bg-elevated hover:bg-elevated-hover transition-colors"
                  >
                    <span className="text-xs font-bold text-gold uppercase tracking-wide">
                      {bookDisplayName(rBook, prefs.language)} {r.chapter}:{r.verseIndex + 1}
                    </span>
                    <p className="text-sm text-fg mt-1 leading-relaxed">{r.text}</p>
                  </button>
                );
              })}
            </div>
          )
        ) : bookSearchQuery.trim().length < 2 ? (
          <p className="text-sm text-fg-muted text-center py-16">
            Type at least 2 characters to search {bookDisplayName(book, prefs.language)}.
          </p>
        ) : bookSearchResults.length === 0 ? (
          <p className="text-sm text-fg-muted text-center py-16">No matching verses found.</p>
        ) : (
          <div className="space-y-2">
            {bookSearchResults.map((r) => (
              <button
                key={`${r.chapter}:${r.verseIndex}`}
                onClick={() => jumpToSearchResult(r.chapter, r.verseIndex)}
                className="w-full text-left p-3 rounded-lg bg-elevated hover:bg-elevated-hover transition-colors"
              >
                <span className="text-xs font-bold text-gold uppercase tracking-wide">
                  {bookDisplayName(book, prefs.language)} {r.chapter}:{r.verseIndex + 1}
                </span>
                <p className="text-sm text-fg mt-1 leading-relaxed">{r.text}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Chapter reading view
  if (book && chapter) {
    return (
      <div
        className="bible-scope bg-base min-h-full max-w-2xl mx-auto px-6 pb-6"
        style={{
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setChapter(null)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0 -ml-2"
            aria-label="Back to chapters"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-gold font-semibold uppercase tracking-widest">
              {prefs.language === "en"
                ? book.testament === "old"
                  ? "Old Testament"
                  : "New Testament"
                : book.testament === "old"
                  ? "ብሉይ ኪዳን"
                  : "አዲስ ኪዳን"}
            </p>
            <h1
              className={`${prefs.language === "en" ? "font-playfair" : "font-abyssinica"} text-2xl font-black tracking-tight truncate ${WORD_ART_TITLE}`}
            >
              {bookDisplayName(book, prefs.language)} {chapter}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
          <button
            onClick={() => setChapter((c) => Math.max(1, (c ?? 1) - 1))}
            disabled={chapter <= 1}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-elevated hover:bg-elevated-hover disabled:opacity-30 transition-colors"
            aria-label="Previous chapter"
          >
            <ChevronLeft size={16} />
          </button>
          {(prefs.language === "am" || (speechSupported && verses)) && (
            <button
              onClick={toggleListen}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                listening ? "bg-gold text-black" : "bg-elevated hover:bg-elevated-hover"
              }`}
            >
              {listening ? <Pause size={16} /> : <Volume2 size={16} />}
              {listening ? "Stop listening" : "Listen"}
            </button>
          )}
          <button
            onClick={() => setChapter((c) => Math.min(book.chapterCount, (c ?? 1) + 1))}
            disabled={chapter >= book.chapterCount}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-elevated hover:bg-elevated-hover disabled:opacity-30 transition-colors"
            aria-label="Next chapter"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={() => setShowBookSearch(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-elevated hover:bg-elevated-hover transition-colors ml-auto"
            aria-label="Search this book"
          >
            <Search size={16} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                showSettings ? "bg-gold text-black" : "bg-elevated hover:bg-elevated-hover"
              }`}
              aria-label="Reading settings"
            >
              <Settings2 size={16} />
            </button>
            {showSettings && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 bg-elevated rounded-lg shadow-2xl p-4 z-20">
                  <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Language</p>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => updatePrefs({ language: "am" })}
                      className={`flex-1 py-2 rounded-md font-semibold text-sm border transition-colors ${
                        prefs.language === "am"
                          ? "bg-white text-black border-transparent"
                          : "border-border text-fg-muted hover:text-fg"
                      }`}
                    >
                      አማርኛ
                    </button>
                    <button
                      onClick={() => updatePrefs({ language: "en" })}
                      className={`flex-1 py-2 rounded-md font-semibold text-sm border transition-colors ${
                        prefs.language === "en"
                          ? "bg-white text-black border-transparent"
                          : "border-border text-fg-muted hover:text-fg"
                      }`}
                    >
                      English
                    </button>
                  </div>
                  {prefs.language === "en" && (
                    <>
                      <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Version</p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {ENGLISH_VERSION_OPTIONS.map((v) => (
                          <button
                            key={v}
                            onClick={() => updatePrefs({ englishVersion: v })}
                            className={`rounded-md border px-2 py-2 text-left transition-colors ${
                              prefs.englishVersion === v
                                ? "bg-white text-black border-transparent"
                                : "border-border text-fg-muted hover:text-fg"
                            }`}
                          >
                            <span className="block text-xs font-bold uppercase">{v}</span>
                            <span className="block text-[10px] font-semibold opacity-80 leading-tight">
                              {ENGLISH_VERSION_LABELS[v]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Text size</p>
                  <div className="flex items-center gap-2 mb-4">
                    {(["sm", "md", "lg", "xl"] as FontSize[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => updatePrefs({ fontSize: s })}
                        className={`flex-1 py-2 rounded-md font-semibold border transition-colors ${
                          s === "sm" ? "text-xs" : s === "md" ? "text-sm" : s === "lg" ? "text-[1rem]" : "text-lg"
                        } ${
                          prefs.fontSize === s
                            ? "bg-white text-black border-transparent"
                            : "border-border text-fg-muted hover:text-fg"
                        }`}
                      >
                        Aa
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-fg-muted text-sm py-16 justify-center">
            <Loader2 size={18} className="animate-spin" />
            Loading {bookDisplayName(book, prefs.language)}...
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4">
            <BookOpen size={18} />
            Couldn't load this book. Check your connection and try again.
          </div>
        ) : verses ? (
          <div className="space-y-1 pb-4">
            {verses.map((verse, i) => {
              if (!verse) return null;
              const key = bookSlug && chapter ? verseKey(bookSlug, chapter, i) : "";
              const ann = annotations[key];
              const highlightMeta = ann?.color ? HIGHLIGHT_COLORS.find((c) => c.id === ann.color) : null;
              const isSelected = selectedVerses.has(i);
              const isEditingNote = editingNoteVerse === i;
              return (
                <div key={i}>
                  <p
                    ref={(el) => {
                      verseRefs.current[i] = el;
                    }}
                    onClick={() =>
                      setSelectedVerses((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    // Suppresses the WebView's native selection callout so only our bottom sheet shows.
                    style={{ WebkitTouchCallout: "none" } as CSSProperties}
                    className={`select-none ${FONT_SIZE_CLASSES[prefs.fontSize]} ${
                      prefs.language === "en" ? ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily] : FONT_FAMILY_CLASSES[prefs.fontFamily]
                    } text-fg leading-loose cursor-pointer rounded-xl px-3 -mx-1.5 py-2 transition-all duration-200 ${
                      highlightMeta ? highlightMeta.bg : "hover:bg-hover"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/15 text-gold text-[10px] font-bold mr-2 align-middle">
                      {i + 1}
                    </span>
                    {/* A dotted underline (native Bible app's own selection
                        style) instead of the old gold inset-shadow box —
                        text-decoration underlines per wrapped line
                        automatically, so a multi-line verse reads as
                        "these lines are selected" rather than one solid
                        highlighted block. */}
                    <span
                      style={
                        isSelected
                          ? {
                              textDecorationLine: "underline",
                              textDecorationStyle: "dotted",
                              textDecorationColor: "var(--color-fg-subtle)",
                              textUnderlineOffset: "6px",
                            }
                          : undefined
                      }
                    >
                      {verse}
                    </span>
                    {ann?.note && (
                      <StickyNote size={13} className="inline-block ml-1.5 mb-1 text-gold align-middle" />
                    )}
                  </p>

                  {isEditingNote && (
                    <div className="mb-2 p-3 bg-elevated rounded-lg">
                      <TextAreaField
                        autoFocus
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add a note for this verse..."
                        rows={2}
                        variant="panel"
                        className="w-full px-3 py-2 text-[1rem] resize-none"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleSaveNote(i)}
                          className="bg-gold text-black text-xs font-bold px-3 py-1.5 rounded-full"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingNoteVerse(null);
                            setNoteDraft("");
                          }}
                          className="text-fg-muted text-xs font-semibold px-3 py-1.5"
                        >
                          Cancel
                        </button>
                        {ann?.note && (
                          <button
                            onClick={() => {
                              setNoteDraft("");
                              handleSaveNote(i);
                            }}
                            className="text-accent-red text-xs font-semibold px-3 py-1.5 ml-auto"
                          >
                            Remove note
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Rendered here (sibling of the selection toolbar below, not
            nested inside it) so it stays mounted on its own captured
            text/citation even if selectedVerses changes or clears while
            it's open — the toolbar's own block unmounts the instant the
            selection does. */}
        {verseImageComposer && (
          <VerseImageComposer
            text={verseImageComposer.text}
            citation={verseImageComposer.citation}
            language={prefs.language}
            initialFontFamily={prefs.englishFontFamily}
            initialAmharicFontFamily={prefs.fontFamily}
            onClose={() => setVerseImageComposer(null)}
          />
        )}

        {selectedVerses.size > 0 &&
          (() => {
            const colorsInSelection = new Set(
              [...selectedVerses].map((i) => {
                const k = bookSlug && chapter ? verseKey(bookSlug, chapter, i) : "";
                return annotations[k]?.color ?? null;
              })
            );
            const activeColor = colorsInSelection.size === 1 ? [...colorsInSelection][0] : null;
            const allFavorited = [...selectedVerses].every((i) => {
              const k = bookSlug && chapter ? verseKey(bookSlug, chapter, i) : "";
              return annotations[k]?.favorite;
            });
            const sortedSelection = [...selectedVerses].sort((a, b) => a - b);
            const selectionCitation = book
              ? `${bookDisplayName(book, prefs.language)} ${chapter}:${formatVerseNumbers(sortedSelection)}`
              : "";
            return (
              // `fixed`, not `sticky`: this used to sit inside <main>'s own
              // scroll box, and since <main> spans the full viewport height
              // (the persistent PlayerBar/MobileNav band overlays it via its
              // own `fixed` positioning rather than sharing layout space —
              // see App.tsx), a sticky-bottom offset here resolved against
              // the bottom of that full-height box, not the visible screen.
              // It only ever "stuck" once scrolled nearly to the end of a
              // chapter, and then landed hidden behind the nav band instead
              // of above it — everywhere else it just sat in normal flow,
              // wherever the selected verse happened to be. Anchoring to the
              // real viewport bottom, offset by BOTTOM_RESERVE_PX (the same
              // reserved height <main>'s own pb-48 and the virtualized list
              // pages already use to clear that band), keeps it in the same
              // place on screen regardless of scroll position or selection.
              //
              // Restyled as a light bottom sheet ("Selected: <citation>"
              // header, colors shown inline instead of behind a toggle)
              // matching the native Bible app's own selection sheet,
              // in this page's own surface tokens rather than a dark navy/
              // gold floating pill — so it reads as part of the page, not a
              // separately-designed overlay dropped on top of it.
              <div className="fixed inset-x-0 z-20 px-3 max-w-2xl mx-auto" style={{ bottom: BOTTOM_RESERVE_PX }}>
                <div
                  className="relative rounded-t-3xl shadow-2xl ring-1 ring-black/[0.06] overflow-hidden"
                  style={{ background: "var(--color-elevated)" }}
                >
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <p className="text-[11px] font-bold text-fg-muted uppercase tracking-wide truncate">
                      Selected: {selectionCitation}
                    </p>
                    <button
                      onClick={() => {
                        setSelectedVerses(new Set());
                        setShowHighlightColors(false);
                      }}
                      aria-label="Cancel selection"
                      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-fg-subtle hover:text-fg hover:bg-hover transition-colors -mr-1"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex items-end gap-1 px-2 pt-2.5 pb-3 overflow-x-auto no-scrollbar">
                    {/* Condensed into one "Highlight" button, same shape as
                        every other action here, until tapped — then it
                        expands in place into the real color swatches.
                        Keeps the row as compact as the rest of the actions
                        instead of spending five slots on colors up front. */}
                    {!showHighlightColors ? (
                      <button
                        onClick={() => setShowHighlightColors(true)}
                        className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                      >
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: activeColor ? undefined : "var(--bible-purple-soft)" }}
                        >
                          {activeColor ? (
                            <span className={`w-5 h-5 rounded-full ${HIGHLIGHT_COLORS.find((c) => c.id === activeColor)?.swatch}`} />
                          ) : (
                            <Highlighter size={16} style={{ color: "var(--bible-purple)" }} />
                          )}
                        </span>
                        Highlight
                      </button>
                    ) : (
                      HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            handleApplyHighlight(c.id);
                            setShowHighlightColors(false);
                          }}
                          aria-label={`Highlight ${c.id}`}
                          className="flex flex-col items-center gap-1 shrink-0 px-1.5 py-1"
                        >
                          <span
                            className={`w-9 h-9 rounded-full ${c.swatch} transition-transform ${
                              activeColor === c.id ? "ring-2 ring-offset-2 ring-fg scale-110" : ""
                            }`}
                            style={activeColor === c.id ? ({ "--tw-ring-offset-color": "var(--color-elevated)" } as CSSProperties) : undefined}
                          />
                        </button>
                      ))
                    )}
                    <div className="w-px h-10 bg-border shrink-0 mx-1 mb-2" />
                    <button
                      onClick={handleToggleFavorite}
                      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bible-rose-soft)" }}>
                        <Heart size={16} style={{ color: "var(--bible-rose)" }} fill={allFavorited ? "currentColor" : "none"} />
                      </span>
                      Save
                    </button>
                    {selectedVerses.size === 1 &&
                      (() => {
                        const soleVerse = [...selectedVerses][0];
                        const soleKey = bookSlug && chapter ? verseKey(bookSlug, chapter, soleVerse) : "";
                        const hasNote = Boolean(annotations[soleKey]?.note);
                        return (
                          <button
                            onClick={() => {
                              setEditingNoteVerse(soleVerse);
                              setNoteDraft(annotations[soleKey]?.note ?? "");
                            }}
                            className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                          >
                            <span
                              className="w-9 h-9 rounded-full flex items-center justify-center"
                              style={{ background: "color-mix(in oklab, var(--color-gold) 18%, transparent)" }}
                            >
                              <StickyNote size={16} style={{ color: "var(--color-gold-dark)" }} />
                            </span>
                            {hasNote ? "Edit note" : "Note"}
                          </button>
                        );
                      })()}
                    <button
                      onClick={handleCopySelected}
                      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bible-blue-soft)" }}>
                        {justCopied ? <Check size={16} style={{ color: "var(--bible-blue)" }} /> : <Copy size={16} style={{ color: "var(--bible-blue)" }} />}
                      </span>
                      {justCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={handleShareSelected}
                      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bible-purple-soft)" }}>
                        {justShared ? <Check size={16} style={{ color: "var(--bible-purple)" }} /> : <Share2 size={16} style={{ color: "var(--bible-purple)" }} />}
                      </span>
                      {justShared ? "Shared" : "Share"}
                    </button>
                    <button
                      onClick={handleImageSelected}
                      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bible-green-soft)" }}>
                        <ImageIcon size={16} style={{ color: "var(--bible-green)" }} />
                      </span>
                      Image
                    </button>
                    <button
                      onClick={() => setShowCompare(true)}
                      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-fg-muted hover:text-fg shrink-0 px-1.5 py-1 rounded-xl hover:bg-hover transition-colors"
                    >
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: "color-mix(in oklab, var(--color-fg) 8%, transparent)" }}
                      >
                        <Columns2 size={16} className="text-fg-muted" />
                      </span>
                      Compare
                    </button>
                  </div>
                </div>
                {showCompare && bookSlug && chapter && book && (
                  <BibleCompareModal
                    bookSlug={bookSlug}
                    chapter={chapter}
                    verseIndices={sortedSelection}
                    reference={`${bookDisplayName(book, prefs.language)} ${chapter}:${formatVerseNumbers(sortedSelection)}`}
                    onClose={() => setShowCompare(false)}
                  />
                )}
              </div>
            );
          })()}
      </div>
    );
  }

  // Chapter picker for a selected book
  if (book) {
    return (
      <div
        className="bible-scope bg-base min-h-full px-6 pb-6 max-w-2xl"
        style={{
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        }}
      >
        <div className="flex items-center gap-2 mb-6 -ml-2">
          <button
            onClick={() => setBookSlug(null)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0"
            aria-label="Back to books"
          >
            <ChevronLeft size={22} />
          </button>
          <div>
            <h1
              className={`${prefs.language === "en" ? "font-playfair" : "font-abyssinica"} text-xl font-bold ${WORD_ART_TITLE}`}
            >
              {bookDisplayName(book, prefs.language)}
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setChapter(n)}
              className="aspect-square rounded-md flex items-center justify-center text-sm font-semibold bg-elevated hover:bg-elevated-hover text-fg transition-colors"
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Book index
  const oldTestament = BIBLE_BOOKS.filter((b) => b.testament === "old");
  const newTestament = BIBLE_BOOKS.filter((b) => b.testament === "new");
  const bookFromSlug = (slug: string) => BIBLE_BOOKS.find((b) => b.slug === slug);

  const TESTAMENT_THEME = {
    old: {
      icon: BookOpen,
      accent: "text-[var(--bible-purple)]",
      badgeBg: "bg-[var(--bible-purple)] text-white",
      label: prefs.language === "en" ? "Old Testament" : "ብሉይ ኪዳን",
    },
    new: {
      icon: Leaf,
      accent: "text-[var(--bible-green)]",
      badgeBg: "bg-[var(--bible-green)] text-white",
      label: prefs.language === "en" ? "New Testament" : "አዲስ ኪዳን",
    },
  } as const;

  // Old/New Testament reading progress — distinct chapters ever opened,
  // divided by each testament's true chapter total (BIBLE_BOOKS.chapterCount
  // sums), not capped by the recency log below. Feeds the "Reading Plan"
  // cards (repurposes this real progress data rather than inventing a
  // fictional day-count plan the app has no data model for).
  const readChapterKeys = getReadChapterKeys();
  const oldSlugs = new Set(oldTestament.map((b) => b.slug));
  const newSlugs = new Set(newTestament.map((b) => b.slug));
  let oldReadCount = 0;
  let newReadCount = 0;
  readChapterKeys.forEach((k) => {
    const slug = k.split(":")[0];
    if (oldSlugs.has(slug)) oldReadCount++;
    else if (newSlugs.has(slug)) newReadCount++;
  });
  const oldTotalChapters = oldTestament.reduce((s, b) => s + b.chapterCount, 0);
  const newTotalChapters = newTestament.reduce((s, b) => s + b.chapterCount, 0);
  const oldPercent = oldTotalChapters ? Math.round((oldReadCount / oldTotalChapters) * 100) : 0;
  const newPercent = newTotalChapters ? Math.round((newReadCount / newTotalChapters) * 100) : 0;

  const openVerse = (slug: string, chapterNum: number, verseIndex: number | null = null) => {
    setActiveModal(null);
    setBookSlug(slug);
    setChapter(chapterNum);
    setJumpToVerse(verseIndex);
  };

  const handleShareHeroVerse = async () => {
    if (!heroVerse) return;
    const text = `“${heroVerse.text}” — ${heroVerse.ref}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // user cancelled or share failed, fall through to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setHeroShared(true);
      setTimeout(() => setHeroShared(false), 1800);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  // Bookmarks/Notes/Favorites/History quick-access lists — small whole-
  // library scans (see getAllAnnotations' own comment), mapped into raw
  // entries (not BibleListModalRow) for their own bespoke modals
  // (BibleBookmarksModal/BibleNotesModal/BibleFavoritesModal/
  // BibleHistoryModal), which need bookSlug/chapter/verseIndex directly
  // to fetch each verse's real text.
  const allAnnotations = getAllAnnotations();
  const bookmarkEntries: BookmarkEntry[] = allAnnotations
    .filter(({ annotation }) => annotation.color)
    .map(({ key, annotation }) => {
      const { bookSlug, chapter, verseIndex } = parseVerseKey(key);
      return { key, bookSlug, chapter, verseIndex, color: annotation.color! };
    });
  const noteEntries: NoteEntry[] = allAnnotations
    .filter(({ annotation }) => annotation.note)
    .map(({ key, annotation }) => {
      const { bookSlug, chapter, verseIndex } = parseVerseKey(key);
      return { key, bookSlug, chapter, verseIndex, note: annotation.note! };
    });
  const favoriteEntries: FavoriteEntry[] = allAnnotations
    .filter(({ annotation }) => annotation.favorite)
    .map(({ key }) => {
      const { bookSlug, chapter, verseIndex } = parseVerseKey(key);
      return { key, bookSlug, chapter, verseIndex };
    });
  const historyEntries: HistoryEntry[] = getRecentHistory(30).map((entry) => ({
    key: `${entry.bookSlug}-${entry.chapter}`,
    bookSlug: entry.bookSlug,
    chapter: entry.chapter,
    readAt: entry.readAt,
  }));

  // Each action gets its own accent (bg/fg) instead of all four sharing
  // one gold tint — a quick, legible color code (purple=bookmarks,
  // gold=notes, blue=history, rose=favorites) rather than four
  // identical-looking circles differentiated only by their tiny icon.
  const QUICK_ACCESS = [
    {
      id: "bookmarks",
      label: "Bookmarks",
      icon: Bookmark,
      bg: "var(--bible-purple-soft)",
      fg: "var(--bible-purple)",
      onClick: () => setActiveModal("bookmarks"),
    },
    {
      id: "notes",
      label: "Notes",
      icon: StickyNote,
      bg: "color-mix(in oklab, var(--color-gold) 18%, transparent)",
      fg: "var(--color-gold-dark)",
      onClick: () => setActiveModal("notes"),
    },
    {
      id: "history",
      label: "History",
      icon: Clock,
      bg: "var(--bible-blue-soft)",
      fg: "var(--bible-blue)",
      onClick: () => setActiveModal("history"),
    },
    {
      id: "favorites",
      label: "Favorites",
      icon: Heart,
      bg: "var(--bible-rose-soft)",
      fg: "var(--bible-rose)",
      onClick: () => setActiveModal("favorites"),
    },
  ] as const;

  // Top-level category row — two real, instant actions rather than
  // navigation: Bible shuffles into a random chapter and starts it
  // playing (real recording or text-to-speech — BibleAudioContext picks
  // which), Audio shuffles the actual song library via the main player.
  // (setShowBookSearch(true) was this tile's previous onClick, but that
  // view only ever renders when a book is already open — `showBookSearch
  // && book` — so from this home screen it was a silent no-op; this
  // replaces a dead tap target with a real one, not a working feature.)
  // No Plan, Devotional, or Community tile — the reference design had
  // those, but nothing on this page backs a standalone feature for any of
  // them (the real reading-plan progress and verse-of-the-day content are
  // already on the page in their own right, below, not gated behind a
  // tile here).
  const CATEGORY_TILES = [
    { id: "bible", label: "Bible", icon: BookOpen, bg: "var(--bible-purple-soft)", fg: "var(--bible-purple)", onClick: shuffleBibleAudio },
    { id: "audio", label: "Audio", icon: Volume2, bg: "var(--bible-green-soft)", fg: "var(--bible-green)", onClick: shuffleMusic },
  ] as const;

  const BookList = ({
    books,
    theme,
  }: {
    books: typeof BIBLE_BOOKS;
    theme: (typeof TESTAMENT_THEME)[keyof typeof TESTAMENT_THEME];
  }) => (
    <div
      className="bg-elevated rounded-xl divide-y divide-border overflow-hidden"
      style={{ animation: "verse-fade-in 0.35s ease-out" }}
    >
      {books.map((b, i) => (
        <button
          key={b.slug}
          onClick={() => setBookSlug(b.slug)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-hover transition-colors text-left"
        >
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 ${theme.badgeBg}`}
          >
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className={`${
                prefs.language === "en" ? ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily] : "font-abyssinica"
              } font-medium text-[1rem] text-[var(--bible-text)] truncate`}
            >
              {bookDisplayName(b, prefs.language)}
            </p>
          </div>
          <span className="text-[10px] text-fg-subtle shrink-0">
            {b.chapterCount} {prefs.language === "en" ? "chapters" : "ምዕራፍ"}
          </span>
          <ChevronRight size={16} className="text-fg-subtle shrink-0" />
        </button>
      ))}
    </div>
  );

  // Reading Plan card — repurposes the real Old/New Testament reading
  // progress into a stat card (medallion + progress ring, title, a short
  // description, and a Books/Chapters/Verses footer) matching the layout
  // of a reference design the user supplied. Books/chapters come from the
  // app's own data; verse counts are the standard, well-known structural
  // totals for each testament (not per-app data). Still toggles the book
  // list below it open/closed on click.
  const ReadingPlanCard = ({ id }: { id: "old" | "new" }) => {
    const theme = TESTAMENT_THEME[id];
    const percent = id === "old" ? oldPercent : newPercent;
    const accentVar = id === "old" ? "var(--bible-purple)" : "var(--bible-green)";
    const accentDeepVar = id === "old" ? "#3F2AAE" : "#1E6E4C";
    const softVar = id === "old" ? "var(--bible-purple-soft)" : "var(--bible-green-soft)";
    const medallionSrc = id === "old" ? "/bible/icons/ot-medallion.jpg" : "/bible/icons/nt-medallion.jpg";
    const subtitle =
      prefs.language === "en"
        ? id === "old"
          ? "Law and Prophets"
          : "Teaching of Messiah"
        : id === "old"
          ? "ሕግና ነቢያት"
          : "የመሲሁ ትምህርት";
    // Real last-read chapter in THIS testament (not just overall recent
    // history — Continuing on the Old Testament card should point at the
    // Old Testament, even if the very last thing read was in the New) —
    // falls back to an honest "Start reading" rather than a fabricated
    // suggestion when there's no history for this testament yet.
    const lastInTestament = getRecentHistory(30)
      .map((entry) => ({ entry, book: bookFromSlug(entry.bookSlug) }))
      .find(({ book }) => book?.testament === id);
    const continueLabel = lastInTestament
      ? `${bookDisplayName(lastInTestament.book!, prefs.language)} ${lastInTestament.entry.chapter}`
      : prefs.language === "en"
        ? "Start reading"
        : "ንባብ ጀምር";
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percent / 100);
    // The continue-reading pill below needs its own click (open the
    // actual chapter) independent of the card's own toggle-the-book-list
    // click — a <button> can't nest inside another <button>, so the card
    // itself is a div (role="button" + onKeyDown keeps it keyboard-
    // operable the way a real button is) and the pill is the one real
    // nested <button>.
    const toggleExpanded = () => setExpandedTestament((prev) => (prev === id ? null : id));
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
        className="relative overflow-hidden text-center rounded-[28px] pt-2 px-4 pb-1 transition-transform active:scale-[0.98] shadow-[0_14px_32px_-16px_rgba(36,28,61,0.32)] ring-1 ring-black/[0.04] cursor-pointer"
        style={{
          backgroundImage: `radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, ${accentVar} 32%, transparent) 0%, transparent 65%), linear-gradient(180deg, ${softVar} 0%, var(--color-elevated) 75%)`,
        }}
      >
        <div className="relative mx-auto mb-1 w-[54px] h-[54px]">
          <svg viewBox="0 0 64 64" className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="white" strokeOpacity="0.65" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={accentVar}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <span className="absolute inset-2 rounded-full overflow-hidden shadow-[0_8px_18px_-6px_rgba(0,0,0,0.4)]">
            <img src={medallionSrc} alt="" className="w-full h-full object-cover" />
          </span>
        </div>

        {/* font-agbalumo — the same display font this page's own Bible
            modals (BibleListModal/BibleCompareModal/BibleSettingsModal
            titles) already use for a premium look, swapped in here for
            the testament name instead of the plain reading font
            (Abyssinica) every verse of body text uses. Colored with this
            card's own accent (purple/green) rather than those modals'
            flat gold, so Old/New stay visually distinct from each other. */}
        <p className="relative font-agbalumo text-xl font-bold leading-tight" style={{ color: accentVar }}>
          {theme.label}
        </p>

        <div className="flex items-center justify-center gap-1.5 my-0.5 opacity-70">
          <span className="h-px w-6" style={{ background: accentVar }} />
          <span className="w-1.5 h-1.5 rotate-45 shrink-0" style={{ background: accentVar }} />
          <span className="h-px w-6" style={{ background: accentVar }} />
        </div>

        <p className="font-abyssinica font-semibold text-[11px] uppercase tracking-wide leading-snug text-fg-muted px-1 mb-1 line-clamp-2">
          {subtitle}
        </p>

        {/* Replaces the old Books/Chapters/Verses stat row — real last-
            read-in-this-testament chapter instead of three static counts,
            styled as a pill with a soft directional glow behind a solid
            icon badge rather than a flat divided grid. The badge (filled
            circle, white glyph) matches how every other icon on this page
            is styled — Quick Access, the category tiles — instead of a
            bare outline icon floating loose in the pill.
            Its own real click (stopPropagation so it doesn't also fire
            the card's toggle-the-book-list click): opens straight into
            the actual last-read chapter, or chapter 1 of this
            testament's first book when there's no history yet — "Start
            reading" should actually start reading, not just expand a
            list. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (lastInTestament) {
              openVerse(lastInTestament.entry.bookSlug, lastInTestament.entry.chapter);
            } else {
              const firstBook = id === "old" ? oldTestament[0] : newTestament[0];
              if (firstBook) openVerse(firstBook.slug, 1);
            }
          }}
          className="relative w-full overflow-hidden flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 active:scale-95 transition-transform"
          style={{ background: `color-mix(in oklab, ${accentDeepVar} 18%, transparent)` }}
        >
          <span
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full blur-md pointer-events-none"
            style={{ background: `color-mix(in oklab, ${accentVar} 55%, transparent)` }}
          />
          <span
            className="relative shrink-0 w-5 h-5 rounded-full flex items-center justify-center shadow-[0_2px_6px_-1px_rgba(0,0,0,0.35)]"
            style={{ background: accentVar }}
          >
            <BookOpen size={11} strokeWidth={2.4} className="text-white" />
          </span>
          <span className="relative flex-1 min-w-0 text-[11px] font-black leading-none truncate text-left" style={{ color: "var(--bible-text)" }}>
            {continueLabel}
          </span>
          <ChevronRight size={13} strokeWidth={2.4} className="relative shrink-0" style={{ color: accentVar }} />
        </button>
      </div>
    );
  };

  return (
    <div
      className="bible-scope bg-base min-h-full px-6 pb-2.5 max-w-2xl"
      style={{
        ...bibleHomeTheme,
        // Pulls this page's own themed background up to cover the status
        // bar's safe-area strip too (main's shared padding-top otherwise
        // leaves that strip showing main's own panel-to-base gradient, a
        // visibly different shade from this page's flat bg-base right
        // below it — a seam right at the top edge). The matching
        // padding-top keeps content sitting exactly where it did before.
        marginTop: "calc(-1 * env(safe-area-inset-top))",
        paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)",
      }}
    >
      {/* Header — this screen's own bespoke header (Topbar suppresses itself
          on /bible), matching the Home/Library convention: brand mark +
          settings/login entry point on the left, notification bell on the
          right opening the same NotificationsPanel as Home's bell (the
          daily-verse push subscribe toggle this bell used to be lives on in
          Bible Settings below, so nothing was lost by repurposing it). Kept
          compact — the whole page is meant to fit one non-scrolling
          screen, same rule the previous design held to. */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigate(user ? "/settings" : "/auth")}
          className="flex items-center gap-2.5 text-left -m-1 p-1"
          aria-label={user ? "Settings" : "Log in"}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--bible-navy)" }}
          >
            <span className="text-white font-playfair font-bold text-[1rem]">M</span>
          </div>
          <h1 className="font-abyssinica font-bold text-base tracking-tight leading-tight" style={{ color: "var(--bible-text)" }}>
            መዝሙር
          </h1>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBibleSettings(true)}
            aria-label="Bible settings"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-elevated ring-1 ring-border"
            style={{ color: "var(--color-gold-dark)" }}
          >
            <Settings2 size={16} />
          </button>
          <button
            onClick={() => setShowNotifications(true)}
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full flex items-center justify-center bg-elevated ring-1 ring-border"
            style={{ color: "var(--color-gold-dark)" }}
          >
            <Bell size={16} />
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-base"
              style={{ background: "var(--color-gold)" }}
            />
          </button>
        </div>
      </div>

      {showBibleSettings && (
        <BibleSettingsModal
          prefs={prefs}
          updatePrefs={updatePrefs}
          mode={mode}
          setMode={setMode}
          pushSubscribed={pushSubscribed}
          pushBusy={pushBusy}
          onToggleNotifications={handleToggleNotifications}
          onClose={() => setShowBibleSettings(false)}
        />
      )}

      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}

      {/* Category row — Bible / Audio only (see CATEGORY_TILES for why
          Plan/Devotional/Community aren't here). Gives the page its own
          distinct "mode" identity (matching BibleModeNav below), separate
          from the Bookmarks/Notes/History/Favorites utility row further
          down. */}
      <div className="flex gap-3 mb-2">
        {CATEGORY_TILES.map((tile) => (
          <button
            key={tile.id}
            onClick={tile.onClick}
            className="flex flex-col items-center gap-1 py-1 active:scale-95 transition-transform"
          >
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: tile.bg }}>
              <tile.icon size={18} style={{ color: tile.fg }} />
            </span>
            <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: "var(--bible-text)" }}>
              {tile.label}
            </span>
          </button>
        ))}
      </div>

      {/* Reading Plan — moved to the top of the page (above the hero) so
          it's the first thing visible. Repurposes the real Old/New
          Testament reading progress (see comment above oldPercent/
          newPercent) into this card look, rather than inventing a
          fictional day-count plan the app has no data for. */}
      <div className="mb-1.5">
        <div className="grid grid-cols-2 gap-3">
          <ReadingPlanCard id="old" />
          <ReadingPlanCard id="new" />
        </div>
        {expandedTestament === "old" && (
          <div className="mt-3">
            <BookList books={oldTestament} theme={TESTAMENT_THEME.old} />
          </div>
        )}
        {expandedTestament === "new" && (
          <div className="mt-3">
            <BookList books={newTestament} theme={TESTAMENT_THEME.new} />
          </div>
        )}
      </div>

      {/* Hero — a single "verse of the day" card (one per local calendar
          day, see the fetch effect above). The background photo defaults to
          the day's pick from HERO_IMAGES but is swipeable across the whole
          set, with a progress line + counter below (not per-photo dots —
          see that indicator's own comment for why). */}
      {!heroVerse ? (
        <div className="w-full h-[176px] rounded-3xl mb-2 animate-pulse" style={{ background: "var(--bible-purple-soft)" }} />
      ) : (
        <div className="mb-1.5">
          <div
            className="relative w-full h-[176px] rounded-3xl overflow-hidden shadow-[0_20px_45px_-18px_rgba(36,28,61,0.35)]"
            onTouchStart={(e) => {
              heroTouchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (heroTouchStartX.current === null) return;
              const delta = e.changedTouches[0].clientX - heroTouchStartX.current;
              if (Math.abs(delta) > 40) {
                setHeroImageIndex((i) =>
                  delta < 0 ? (i + 1) % HERO_IMAGES.length : (i - 1 + HERO_IMAGES.length) % HERO_IMAGES.length
                );
              }
              heroTouchStartX.current = null;
            }}
          >
            <div
              className="absolute inset-0 flex h-full transition-transform duration-200 ease-out"
              style={{ transform: `translateX(-${heroImageIndex * 100}%)` }}
            >
              {/* 29 photos now (was 9) — lazy + async so the ~28 not
                  currently shown don't all fetch on page load, only the
                  ones a swipe actually brings near-visible. */}
              {HERO_IMAGES.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full shrink-0 object-cover"
                />
              ))}
            </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />
          <button
            onClick={handleShareHeroVerse}
            aria-label="Share verse"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md active:scale-90 transition-transform"
          >
            {heroShared ? (
              <Check size={14} style={{ color: "var(--bible-purple)" }} />
            ) : (
              <Share2 size={13} style={{ color: "var(--bible-navy)" }} />
            )}
          </button>
          <div className="relative h-full flex flex-col items-center text-center justify-end p-4 pointer-events-none">
            <span
              className="self-start inline-flex w-fit items-center gap-1.5 rounded-full bg-white/90 text-[9px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 mb-2"
              style={{ color: "var(--bible-purple)" }}
            >
              <Sun size={11} strokeWidth={2.5} />
              {prefs.language === "en" ? "Verse of the Day" : "የዕለቱ ቃል"}
            </span>
            <p
              className={`${
                prefs.language === "en"
                  ? `${ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily]} text-[1.05rem]`
                  : "font-abyssinica text-[0.9rem]"
              } font-bold text-white leading-snug mb-1.5 line-clamp-3 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]`}
            >
              {heroVerse.text}
            </p>
            <div className="w-full flex items-center justify-end gap-3">
              <button
                onClick={() => openVerse(heroVerse.slug, heroVerse.chapter, heroVerse.verseIndex)}
                aria-label={prefs.language === "en" ? "Read full chapter" : "ሙሉውን ያንብቡ"}
                className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition-transform"
                style={{ background: "var(--bible-navy)" }}
              >
                <BookOpen size={15} />
              </button>
              <p className="text-[11px] font-semibold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">{heroVerse.ref}</p>
            </div>
          </div>
          </div>
          {/* A 29-photo set doesn't fit as individual dots on a phone width
              (29 × dot+gap overflows well past the screen) — a thin
              progress line + "n / total" counter scales to any pool size
              and reads as more deliberate than a row of dots wrapping or
              overflowing. Swiping the hero still moves through every
              photo; this just shows where you are in that set. */}
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <div
              className="h-1 w-24 rounded-full overflow-hidden"
              style={{ background: "color-mix(in oklab, var(--color-fg-subtle) 30%, transparent)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${((heroImageIndex + 1) / HERO_IMAGES.length) * 100}%`,
                  background: "var(--bible-purple)",
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-fg-subtle tabular-nums">
              {heroImageIndex + 1}/{HERO_IMAGES.length}
            </span>
          </div>
        </div>
      )}

      {/* Quick Access — Bookmarks / Notes / History / Favorites in one card. */}
      <div
        className="relative rounded-2xl mb-3 shadow-[0_10px_28px_-16px_rgba(36,28,61,0.3)] ring-1 ring-black/[0.04] overflow-hidden"
        style={{ background: "var(--color-elevated)" }}
      >
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
        <div className="grid grid-cols-4">
          {QUICK_ACCESS.map((item, i) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex flex-col items-center gap-1 py-2.5 min-w-0 active:scale-95 transition-transform ${
                i > 0 ? "border-l border-border" : ""
              }`}
            >
              <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: item.bg }}>
                <item.icon size={18} style={{ color: item.fg }} />
              </span>
              <span className="text-xs font-semibold text-center leading-tight w-full truncate" style={{ color: "var(--bible-text)" }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Books — 14 of the 66, reshuffled daily (booksOfTheDay), not a
          ranked "Popular Books" list (there's no real popularity/read-
          count data to rank by — see bibleReadingHistory.ts). */}
      <div className="mb-1.5">
        <div className="flex items-center gap-2 mb-2">
          <Book size={16} style={{ color: "var(--color-gold-dark)" }} />
          <h2 className="text-sm font-bold" style={{ color: "var(--bible-text)" }}>
            {prefs.language === "en" ? "Books" : "መጻሕፍት"}
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-0.5">
          {booksOfTheDay.map((slug) => {
            const b = bookFromSlug(slug);
            if (!b) return null;
            const cover = BOOK_COVER_PHOTOS[slug];
            return (
              <button
                key={slug}
                onClick={() => openVerse(slug, 1)}
                className="shrink-0 w-24 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                {/* Name moved off the photo into its own caption below —
                    the Amharic names for these books are two-word phrases
                    (e.g. "መዝሙረ ዳዊት", "የማቴዎስ ወንጌል") that a single line
                    clamped over an 80px photo was cutting off. A plain
                    caption area with room to wrap to 2 lines shows the
                    whole name regardless of length or script. */}
                <span
                  className="w-24 h-24 rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/[0.04] block bg-cover"
                  style={{
                    backgroundImage: `url(${cover.src})`,
                    backgroundPosition: cover.position ?? "center",
                  }}
                />
                <span
                  className={`${
                    prefs.language === "en" ? ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily] : "font-abyssinica"
                  } text-[11px] font-bold text-center leading-tight line-clamp-2 w-full`}
                  style={{ color: "var(--bible-text)" }}
                >
                  {bookDisplayName(b, prefs.language)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeModal === "bookmarks" && (
        <BibleBookmarksModal
          entries={bookmarkEntries}
          language={prefs.language}
          englishVersion={prefs.englishVersion}
          onOpenVerse={(s, c, v) => openVerse(s, c, v)}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "notes" && (
        <BibleNotesModal
          entries={noteEntries}
          language={prefs.language}
          englishVersion={prefs.englishVersion}
          onOpenVerse={(s, c, v) => openVerse(s, c, v)}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "favorites" && (
        <BibleFavoritesModal
          entries={favoriteEntries}
          language={prefs.language}
          englishVersion={prefs.englishVersion}
          onOpenVerse={(s, c, v) => openVerse(s, c, v)}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "history" && (
        <BibleHistoryModal
          entries={historyEntries}
          language={prefs.language}
          englishVersion={prefs.englishVersion}
          onOpenVerse={(s, c, v) => openVerse(s, c, v)}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
