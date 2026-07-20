import {
  Bell,
  Book,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Heart,
  Leaf,
  Loader2,
  Pause,
  ScrollText,
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
import BibleListModal, { type BibleListModalRow } from "../components/bible/BibleListModal";
import BibleSettingsModal from "../components/bible/BibleSettingsModal";
import TextAreaField from "../components/form/TextAreaField";
import TextField from "../components/form/TextField";
import { MORNING_VERSES } from "../data/morningVerses";
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

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

type BookText = Record<string, string[]>; // chapter number -> verses

// Amharic name in "am" mode (the app's default, matching every existing
// user's current experience unchanged); English name in "en" mode, where
// public/bible/en/<slug>.json (King James Version — public domain, no
// licensing restriction) is the text actually being read.
function bookDisplayName(book: BibleBookMeta, language: "am" | "en"): string {
  return language === "en" ? book.name : book.nameAm;
}

const WORD_ART_TITLE =
  "bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent drop-shadow-[0_1px_12px_rgba(242,183,5,0.35)]";

// A distinct premium tone per Continue Reading tile (cycled by index) —
// all within the gold/bronze/copper family so the row reads as one
// cohesive, premium palette rather than random colors.
const TILE_GOLD_PALETTE = [
  { gradient: "linear-gradient(160deg, #E3C167, #A9862B)", accent: "#C9A34A" },
  { gradient: "linear-gradient(160deg, #D98850, #8B4A24)", accent: "#C97A46" },
  { gradient: "linear-gradient(160deg, #E8D6A0, #B89B5E)", accent: "#CBAE72" },
  { gradient: "linear-gradient(160deg, #E0A94E, #9C6B1C)", accent: "#D0922E" },
  { gradient: "linear-gradient(160deg, #C2A66B, #6E5A32)", accent: "#A88C52" },
  { gradient: "linear-gradient(160deg, #C9A34A, #7A5C1E)", accent: "#A9862B" },
];

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
const HERO_IMAGES = [
  "/bible/hero/sunset-verse.jpg",
  "/bible/hero/wheat-field.jpg",
  "/bible/hero/three-crosses.jpg",
  "/bible/hero/beach-sunset.jpg",
  "/bible/hero/holy-bible.jpg",
  "/bible/hero/aerial-village-sunset.jpg",
  "/bible/hero/hebrew-scripture.jpg",
  "/bible/hero/golden-sunset-sky.jpg",
  "/bible/hero/misty-road-cross.jpg",
];

function dailyHeroImageIndexFor(date: Date): number {
  const dayKey = `img:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
  return hash % HERO_IMAGES.length;
}

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
  const [speaking, setSpeaking] = useState(false);
  // Which testament's book list is open, if any — mutually exclusive
  // (opening one closes the other) rather than two independent booleans,
  // so only one book list is ever visible at a time.
  const [expandedTestament, setExpandedTestament] = useState<"old" | "new" | null>(null);

  const [annotations, setAnnotations] = useState<Record<string, VerseAnnotation>>({});
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [editingNoteVerse, setEditingNoteVerse] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [justCopied, setJustCopied] = useState(false);
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => loadReadingPrefs());
  const [showSettings, setShowSettings] = useState(false);
  const [showBibleSettings, setShowBibleSettings] = useState(false);
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

  const book = BIBLE_BOOKS.find((b) => b.slug === bookSlug) ?? null;
  const verses = chapter ? bookText?.[chapter] : undefined;

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

  const stopSpeaking = () => {
    if (speechSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // Fetch the whole book once per selection+language (public/bible/<slug>.json
  // for Amharic, public/bible/en/<slug>.json for the King James Version), not
  // bundled into the app — a full Bible translation is several MB, too large
  // to ship in the JS bundle, so each book loads on demand the first time
  // it's opened (and again if the reader switches language mid-chapter).
  useEffect(() => {
    stopSpeaking();
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
    stopSpeaking();
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

  useEffect(() => stopSpeaking, []);

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
    // still clips as a hard backstop if this estimate is ever off).
    const MAX_VERSE_CHARS = 100;
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

  const toggleListen = () => {
    if (!speechSupported || !verses) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(verses.filter(Boolean).join(" "));
    utterance.lang = "am-ET";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
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

  const handleCopySelected = async () => {
    if (!verses) return;
    const ids = [...selectedVerses].sort((a, b) => a - b);
    const text = ids
      .map((i) => verses[i])
      .filter(Boolean)
      .join(" ");
    try {
      await navigator.clipboard.writeText(text);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore
    }
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
      <div className="bible-scope bg-base min-h-full max-w-2xl mx-auto px-6 py-6">
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
      <div className="bible-scope bg-base min-h-full max-w-2xl mx-auto px-6 py-6">
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
          {speechSupported && verses && (
            <button
              onClick={toggleListen}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                speaking ? "bg-gold text-black" : "bg-elevated hover:bg-elevated-hover"
              }`}
            >
              {speaking ? <Pause size={16} /> : <Volume2 size={16} />}
              {speaking ? "Stop listening" : "Listen"}
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
                    className={`${FONT_SIZE_CLASSES[prefs.fontSize]} ${
                      prefs.language === "en" ? ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily] : FONT_FAMILY_CLASSES[prefs.fontFamily]
                    } text-fg leading-loose cursor-pointer rounded-lg px-2 -mx-2 py-1.5 transition-all ${
                      highlightMeta ? highlightMeta.bg : "hover:bg-hover"
                    } ${isSelected ? "ring-2 ring-gold ring-inset" : ""}`}
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/15 text-gold text-[10px] font-bold mr-2 align-middle">
                      {i + 1}
                    </span>
                    {verse}
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

        {selectedVerses.size > 0 && (
          <div className="sticky bottom-4 z-20 flex items-center gap-2 flex-wrap p-3 bg-elevated rounded-xl shadow-2xl border border-border">
            <span className="text-xs font-bold text-fg-muted pl-1 pr-1">
              {selectedVerses.size} {selectedVerses.size === 1 ? "verse" : "verses"}
            </span>
            <div className="w-px h-5 bg-border" />
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => handleApplyHighlight(c.id)}
                className={`w-7 h-7 rounded-full ${c.swatch} transition-transform hover:scale-110`}
                aria-label={`Highlight ${c.id}`}
              />
            ))}
            <div className="w-px h-5 bg-border" />
            <button
              onClick={handleCopySelected}
              className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1.5 rounded-md hover:bg-hover transition-colors"
            >
              {justCopied ? <Check size={14} className="text-gold" /> : <Copy size={14} />}
              {justCopied ? "Copied" : "Copy"}
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
                    className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1.5 rounded-md hover:bg-hover transition-colors"
                  >
                    <StickyNote size={14} />
                    {hasNote ? "Edit note" : "Note"}
                  </button>
                );
              })()}
            {(() => {
              const soleVerse = selectedVerses.size === 1 ? [...selectedVerses][0] : null;
              const soleKey = soleVerse !== null && bookSlug && chapter ? verseKey(bookSlug, chapter, soleVerse) : "";
              const isFavorited = Boolean(annotations[soleKey]?.favorite);
              return (
                <button
                  onClick={handleToggleFavorite}
                  className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg px-2 py-1.5 rounded-md hover:bg-hover transition-colors"
                >
                  <Heart size={14} className={isFavorited ? "text-red-400" : ""} fill={isFavorited ? "currentColor" : "none"} />
                  {isFavorited ? "Favorited" : "Favorite"}
                </button>
              );
            })()}
            <button
              onClick={() => setSelectedVerses(new Set())}
              className="ml-auto text-xs font-semibold text-fg-subtle hover:text-fg px-2 py-1.5"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  // Chapter picker for a selected book
  if (book) {
    return (
      <div className="bible-scope bg-base min-h-full px-6 py-6 max-w-2xl">
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
  // Standard verse counts (structural facts about the Bible, not per-app
  // data) — the same figures the reference design's stat footer used.
  const oldTotalVerses = 23145;
  const newTotalVerses = 7959;

  const recentHistory = getRecentHistory(8);

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
  // library scans (see getAllAnnotations' own comment) mapped into the
  // shared BibleListModal row shape.
  const allAnnotations = getAllAnnotations();
  const bookmarkRows: BibleListModalRow[] = allAnnotations
    .filter(({ annotation }) => annotation.color)
    .map(({ key, annotation }) => {
      const { bookSlug: s, chapter: c, verseIndex: v } = parseVerseKey(key);
      const b = bookFromSlug(s);
      const swatch = HIGHLIGHT_COLORS.find((h) => h.id === annotation.color);
      return {
        key,
        title: `${b?.nameAm ?? s} ${c}:${v + 1}`,
        subtitle: b ? TESTAMENT_THEME[b.testament].label : undefined,
        badge: <span className={`w-3 h-3 rounded-full shrink-0 ${swatch?.swatch ?? "bg-gold"}`} />,
        onClick: () => openVerse(s, c, v),
      };
    });
  const noteRows: BibleListModalRow[] = allAnnotations
    .filter(({ annotation }) => annotation.note)
    .map(({ key, annotation }) => {
      const { bookSlug: s, chapter: c, verseIndex: v } = parseVerseKey(key);
      const b = bookFromSlug(s);
      return {
        key,
        title: `${b?.nameAm ?? s} ${c}:${v + 1}`,
        subtitle: annotation.note,
        badge: <StickyNote size={16} className="text-gold shrink-0" />,
        onClick: () => openVerse(s, c, v),
      };
    });
  const favoriteRows: BibleListModalRow[] = allAnnotations
    .filter(({ annotation }) => annotation.favorite)
    .map(({ key }) => {
      const { bookSlug: s, chapter: c, verseIndex: v } = parseVerseKey(key);
      const b = bookFromSlug(s);
      return {
        key,
        title: `${b?.nameAm ?? s} ${c}:${v + 1}`,
        subtitle: b ? TESTAMENT_THEME[b.testament].label : undefined,
        badge: <Heart size={16} className="text-red-400 shrink-0" fill="currentColor" />,
        onClick: () => openVerse(s, c, v),
      };
    });
  const historyRows: BibleListModalRow[] = getRecentHistory(30).map((entry) => {
    const b = bookFromSlug(entry.bookSlug);
    return {
      key: `${entry.bookSlug}-${entry.chapter}`,
      title: `${b?.nameAm ?? entry.bookSlug} ${entry.chapter}`,
      subtitle: b ? TESTAMENT_THEME[b.testament].label : undefined,
      badge: <Clock size={16} className="text-fg-subtle shrink-0" />,
      onClick: () => openVerse(entry.bookSlug, entry.chapter),
    };
  });

  const QUICK_ACCESS = [
    { id: "bookmarks", label: "Bookmarks", icon: Bookmark, onClick: () => setActiveModal("bookmarks") },
    { id: "notes", label: "Notes", icon: StickyNote, onClick: () => setActiveModal("notes") },
    { id: "history", label: "History", icon: Clock, onClick: () => setActiveModal("history") },
    { id: "favorites", label: "Favorites", icon: Heart, onClick: () => setActiveModal("favorites") },
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
          : "Teaching of the Messiah"
        : id === "old"
          ? "ሕግና ነቢያት"
          : "የመሲሁ ትምህርት";
    const stats = [
      {
        icon: Book,
        value: (id === "old" ? oldTestament.length : newTestament.length).toLocaleString(),
        label: prefs.language === "en" ? "Books" : "መጻሕፍት",
        color: "var(--color-gold)",
      },
      {
        icon: ScrollText,
        value: (id === "old" ? oldTotalChapters : newTotalChapters).toLocaleString(),
        label: prefs.language === "en" ? "Chapters" : "ምዕራፍ",
        color: "#C97A46",
      },
      {
        icon: Bookmark,
        value: (id === "old" ? oldTotalVerses : newTotalVerses).toLocaleString(),
        label: prefs.language === "en" ? "Verses" : "ጥቅሶች",
        color: "#CBAE72",
      },
    ];
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percent / 100);
    return (
      <button
        onClick={() => setExpandedTestament((prev) => (prev === id ? null : id))}
        className="relative overflow-hidden text-center rounded-[28px] pt-3 px-4 pb-2 transition-transform active:scale-[0.98] shadow-[0_14px_32px_-16px_rgba(36,28,61,0.32)] ring-1 ring-black/[0.04]"
        style={{
          backgroundImage: `radial-gradient(120% 70% at 50% 0%, color-mix(in oklab, ${accentVar} 22%, transparent) 0%, transparent 65%), linear-gradient(180deg, ${softVar} 0%, var(--color-elevated) 75%)`,
        }}
      >
        <div className="relative mx-auto mb-1.5 w-[77px] h-[77px]">
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

        <p className="relative font-abyssinica text-xl font-black leading-tight" style={{ color: "var(--bible-text)" }}>
          {theme.label}
        </p>

        <div className="flex items-center justify-center gap-1.5 my-1 opacity-70">
          <span className="h-px w-6" style={{ background: accentVar }} />
          <span className="w-1.5 h-1.5 rotate-45 shrink-0" style={{ background: accentVar }} />
          <span className="h-px w-6" style={{ background: accentVar }} />
        </div>

        <p className="font-abyssinica font-bold text-xs leading-snug text-fg-muted px-1 mb-1.5 line-clamp-2">{subtitle}</p>

        <div className="grid grid-cols-3 rounded-xl py-1.5" style={{ background: `color-mix(in oklab, ${accentDeepVar} 18%, transparent)` }}>
          {stats.map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center gap-0.5 ${i > 0 ? "border-l border-black/10" : ""}`}>
              <s.icon size={12} style={{ color: s.color }} />
              <span className="text-xs font-black leading-none" style={{ color: "var(--bible-text)" }}>
                {s.value}
              </span>
              <span className="text-[7px] font-bold uppercase tracking-wide text-fg-subtle">{s.label}</span>
            </div>
          ))}
        </div>
      </button>
    );
  };

  return (
    <div className="bible-scope bg-base min-h-full px-6 py-4 max-w-2xl" style={bibleHomeTheme}>
      {/* Header — this screen's own bespoke header (Topbar suppresses itself
          on /bible), matching the Home/Library convention: brand mark +
          settings/login entry point on the left, decorative notification
          bell on the right (mirrors Home's own not-yet-wired bell). Kept
          compact — the whole page is meant to fit one non-scrolling
          screen, same rule the previous design held to. */}
      <div className="flex items-center justify-between mb-3">
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
            onClick={handleToggleNotifications}
            disabled={pushBusy}
            aria-label={pushSubscribed ? "Turn off daily verse notifications" : "Turn on daily verse notifications"}
            className="relative w-9 h-9 rounded-full flex items-center justify-center bg-elevated ring-1 ring-border transition-opacity disabled:opacity-60"
            style={{ color: "var(--color-gold-dark)" }}
          >
            <Bell size={16} fill={pushSubscribed ? "currentColor" : "none"} />
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

      {/* Reading Plan — moved to the top of the page (above the hero) so
          it's the first thing visible. Repurposes the real Old/New
          Testament reading progress (see comment above oldPercent/
          newPercent) into this card look, rather than inventing a
          fictional day-count plan the app has no data for. */}
      <div className="mb-3">
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
          set, with dots below to show/jump to position. */}
      {!heroVerse ? (
        <div className="w-full h-[175px] rounded-3xl mb-3 animate-pulse" style={{ background: "var(--bible-purple-soft)" }} />
      ) : (
        <div className="mb-3">
          <div
            className="relative w-full h-[175px] rounded-3xl overflow-hidden shadow-[0_20px_45px_-18px_rgba(36,28,61,0.35)]"
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
              className="absolute inset-0 flex h-full transition-transform duration-400 ease-out"
              style={{ transform: `translateX(-${heroImageIndex * 100}%)` }}
            >
              {HERO_IMAGES.map((src) => (
                <img key={src} src={src} alt="" className="w-full h-full shrink-0 object-cover" />
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
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {HERO_IMAGES.map((src, i) => (
              <button
                key={src}
                onClick={() => setHeroImageIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === heroImageIndex ? "20px" : "6px",
                  background: i === heroImageIndex ? "var(--bible-purple)" : "var(--color-fg-subtle)",
                  opacity: i === heroImageIndex ? 1 : 0.4,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick Access — Bookmarks / Notes / History / Favorites in one card. */}
      <div
        className="relative rounded-2xl mb-5 shadow-[0_10px_28px_-16px_rgba(36,28,61,0.3)] ring-1 ring-black/[0.04] overflow-hidden"
        style={{ background: "var(--color-elevated)" }}
      >
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
        <div className="grid grid-cols-4">
          {QUICK_ACCESS.map((item, i) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex flex-col items-center gap-2 py-4 min-w-0 active:scale-95 transition-transform ${
                i > 0 ? "border-l border-border" : ""
              }`}
            >
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: "color-mix(in oklab, var(--color-gold) 18%, transparent)" }}
              >
                <item.icon size={18} style={{ color: "var(--color-gold-dark)" }} />
              </span>
              <span className="text-xs font-semibold text-center leading-tight w-full truncate" style={{ color: "var(--bible-text)" }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Continue Reading — vertical list (matches the reference design),
          as a compact horizontal row (not the reference's taller vertical
          list) — the whole home screen is meant to fit one non-scrolling
          view, and a vertical list here would push it past that. Percent is
          real progress through the book (chapter / total chapters) —
          there's no per-chapter scroll-position tracking to derive a truer
          in-chapter percentage from. */}
      {recentHistory.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen size={16} style={{ color: "var(--color-gold-dark)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--bible-text)" }}>
                {prefs.language === "en" ? "Continue Reading" : "ንባብ ይቀጥሉ"}
              </h2>
            </div>
            <button
              onClick={() => setActiveModal("history")}
              className="flex items-center gap-0.5 text-xs font-semibold transition-colors"
              style={{ color: "var(--bible-purple)" }}
            >
              {prefs.language === "en" ? "View all" : "ሁሉንም ይመልከቱ"}
              <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
            {recentHistory.slice(0, 6).map((entry, i) => {
              const b = bookFromSlug(entry.bookSlug);
              if (!b) return null;
              const percent = Math.round((entry.chapter / b.chapterCount) * 100);
              const palette = TILE_GOLD_PALETTE[i % TILE_GOLD_PALETTE.length];
              const accentVar = palette.accent;
              const tileGradient = palette.gradient;
              return (
                <button
                  key={`${entry.bookSlug}-${entry.chapter}`}
                  onClick={() => openVerse(entry.bookSlug, entry.chapter)}
                  className="shrink-0 w-28 rounded-xl p-2.5 text-left shadow-sm ring-1 ring-black/[0.04] active:scale-95 transition-transform"
                  style={{ background: "var(--color-elevated)" }}
                >
                  <div
                    className="w-full h-12 rounded-lg flex items-center justify-between px-2 mb-2"
                    style={{ backgroundImage: `linear-gradient(160deg, rgba(0,0,0,0.05), rgba(0,0,0,0.4)), ${tileGradient}` }}
                  >
                    <span
                      className={`${
                        prefs.language === "en" ? ENGLISH_FONT_FAMILY_CLASSES[prefs.englishFontFamily] : "font-abyssinica"
                      } text-white font-bold text-xs leading-tight line-clamp-1 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]`}
                    >
                      {bookDisplayName(b, prefs.language)}
                    </span>
                    <span className="text-white text-[10px] font-semibold shrink-0 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                      {entry.chapter}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-black/[0.06] overflow-hidden mb-1">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, background: accentVar }} />
                  </div>
                  <p className="text-[10px] font-semibold text-fg-muted">{percent}%</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeModal === "bookmarks" && (
        <BibleListModal
          title="የመጽሐፍ ምልክት"
          emptyLabel="እስካሁን ምንም ምልክት አልተደረገም።"
          rows={bookmarkRows}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "notes" && (
        <BibleListModal
          title="ማስታወሻዎች"
          emptyLabel="እስካሁን ምንም ማስታወሻ የለም።"
          rows={noteRows}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "favorites" && (
        <BibleListModal
          title="የሚወደዱ"
          emptyLabel="እስካሁን ምንም የተወደደ ጥቅስ የለም።"
          rows={favoriteRows}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "history" && (
        <BibleListModal
          title="ታሪክ"
          emptyLabel="እስካሁን ምንም አልተነበበም።"
          rows={historyRows}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
