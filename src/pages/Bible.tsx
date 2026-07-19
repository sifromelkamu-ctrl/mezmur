import {
  Bell,
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
import { BIBLE_BOOKS } from "../data/bibleBooks";
import { useAuth } from "../context/useAuth";
import BibleListModal, { type BibleListModalRow } from "../components/bible/BibleListModal";
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
  FONT_FAMILY_CLASSES,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_CLASSES,
  loadReadingPrefs,
  saveReadingPrefs,
  type FontSize,
  type ReadingPrefs,
} from "../utils/bibleReadingPrefs";
import { getReadChapterKeys, getRecentHistory, recordChapterRead } from "../utils/bibleReadingHistory";

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

type BookText = Record<string, string[]>; // chapter number -> verses

const WORD_ART_TITLE =
  "bg-gradient-to-r from-gold via-gold-glow to-gold bg-clip-text text-transparent drop-shadow-[0_1px_12px_rgba(242,183,5,0.35)]";

// The Bible *home* screen (only) renders in its own fixed light purple/green
// palette, independent of the app's global dark/gold theme toggle — set as
// inline CSS custom properties (rather than a stylesheet rule) so it always
// wins regardless of :root.light, with zero cascade fighting. Every other
// Bible view (chapter reader, book picker, search) is unaffected and keeps
// the app's usual dark/gold theming.
const BIBLE_HOME_THEME = {
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
  "--bible-green": "#2F9E6E",
  "--bible-green-soft": "#E3F5EC",
} as CSSProperties;

// Picks a single index into MORNING_VERSES (0..364) for a given date, keyed
// off the LOCAL calendar day so it rotates at each visitor's own midnight
// with no server-side scheduling. Exported in spirit only — the server-side
// daily push job (see server/src/jobs/dailyVerse.ts) must replicate this
// exact same hash so the push notification always matches what the in-app
// hero card shows that day.
function dailyVerseIndexFor(date: Date): number {
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
  return hash % MORNING_VERSES.length;
}

export default function Bible() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookSlug, setBookSlug] = useState<string | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [bookText, setBookText] = useState<BookText | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [expanded, setExpanded] = useState<{ old: boolean; new: boolean }>({ old: false, new: false });

  const [annotations, setAnnotations] = useState<Record<string, VerseAnnotation>>({});
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [editingNoteVerse, setEditingNoteVerse] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [justCopied, setJustCopied] = useState(false);
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => loadReadingPrefs());
  const [showSettings, setShowSettings] = useState(false);
  const [heroVerse, setHeroVerse] = useState<
    { id: string; ref: string; text: string; slug: string; chapter: number; verseIndex: number } | null
  >(null);
  const [heroShared, setHeroShared] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [activeModal, setActiveModal] = useState<"bookmarks" | "notes" | "favorites" | "history" | null>(null);

  const [showBookSearch, setShowBookSearch] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"chapter" | "book">("book");
  const [jumpToVerse, setJumpToVerse] = useState<number | null>(null);
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

  const jumpToSearchResult = (targetChapter: number, verseIndex: number) => {
    setShowBookSearch(false);
    setBookSearchQuery("");
    setJumpToVerse(verseIndex);
    setChapter(targetChapter);
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

  // Fetch the whole book once per selection (public/bible/<slug>.json), not
  // bundled into the app — a full Amharic Bible is ~6MB, too large to ship in
  // the JS bundle, so each book loads on demand the first time it's opened.
  useEffect(() => {
    stopSpeaking();
    setBookText(null);
    setLoadError(false);
    if (!bookSlug) return;
    setLoading(true);
    fetch(`/bible/${bookSlug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: BookText) => setBookText(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug]);

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
    const pick = MORNING_VERSES[dailyVerseIndexFor(new Date())];
    fetch(`/bible/${pick.slug}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: BookText) => {
        const text = data[String(pick.chapter)]?.[pick.verseIndex];
        if (text) {
          setHeroVerse({
            id: `${pick.slug}-${pick.chapter}-${pick.verseIndex}`,
            ref: pick.refAm,
            text,
            slug: pick.slug,
            chapter: pick.chapter,
            verseIndex: pick.verseIndex,
          });
        }
      })
      .catch(() => {});
  }, []);

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
              placeholder={`${book.nameAm} ውስጥ ጥቅስ ፈልግ...`}
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
            ጠቅላላ መጽሐፍ
          </button>
          <button
            onClick={() => setSearchScope("chapter")}
            disabled={!chapter}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-30 ${
              searchScope === "chapter" ? "bg-white text-black" : "bg-elevated text-fg-muted hover:bg-elevated-hover"
            }`}
          >
            {chapter ? `ምዕራፍ ${chapter} ብቻ` : "የአሁኑ ምዕራፍ"}
          </button>
        </div>

        {bookSearchQuery.trim().length < 2 ? (
          <p className="text-sm text-fg-muted text-center py-16">
            Type at least 2 characters to search {book.nameAm}.
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
                  {book.nameAm} {r.chapter}:{r.verseIndex + 1}
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
              {book.testament === "old" ? "ብሉይ ኪዳን" : "አዲስ ኪዳን"}
            </p>
            <h1 className={`font-abyssinica text-2xl font-black tracking-tight truncate ${WORD_ART_TITLE}`}>
              {book.nameAm} {chapter}
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
                  <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">Amharic font</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_FAMILY_OPTIONS.map((f) => (
                      <button
                        key={f}
                        onClick={() => updatePrefs({ fontFamily: f })}
                        className={`rounded-md border px-2 py-2 text-left transition-colors ${
                          prefs.fontFamily === f
                            ? "bg-white text-black border-transparent"
                            : "border-border text-fg-muted hover:text-fg"
                        }`}
                      >
                        <span className={`block text-[1rem] leading-none mb-1 ${FONT_FAMILY_CLASSES[f]}`}>ብርሃን</span>
                        <span className="block text-[10px] font-semibold opacity-80">{FONT_FAMILY_LABELS[f]}</span>
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
            Loading {book.nameAm}...
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
                    className={`${FONT_SIZE_CLASSES[prefs.fontSize]} ${FONT_FAMILY_CLASSES[prefs.fontFamily]} text-fg leading-loose cursor-pointer rounded-lg px-2 -mx-2 py-1.5 transition-all ${
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
            <h1 className={`font-abyssinica text-xl font-bold ${WORD_ART_TITLE}`}>{book.nameAm}</h1>
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
      label: "ብሉይ ኪዳን",
    },
    new: {
      icon: Leaf,
      accent: "text-[var(--bible-green)]",
      badgeBg: "bg-[var(--bible-green)] text-white",
      label: "አዲስ ኪዳን",
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
            <p className="font-abyssinica font-medium text-[1rem] text-[var(--bible-navy)] truncate">{b.nameAm}</p>
          </div>
          <span className="text-[10px] text-fg-subtle shrink-0">{b.chapterCount} ምዕራፍ</span>
          <ChevronRight size={16} className="text-fg-subtle shrink-0" />
        </button>
      ))}
    </div>
  );

  // Reading Plan card — repurposes the real Old/New Testament reading
  // progress above into a centered "badge" card. The badge itself is a
  // circular progress ring around the icon (Apple-Watch-style) rather than
  // a flat medallion + separate bar — progress lives in one place instead
  // of two, with no percent/chapter-count text (kept deliberately spare).
  // Still toggles the book list below it open/closed on click.
  const ReadingPlanCard = ({ id }: { id: "old" | "new" }) => {
    const theme = TESTAMENT_THEME[id];
    const Icon = theme.icon;
    const percent = id === "old" ? oldPercent : newPercent;
    const accentVar = id === "old" ? "var(--bible-purple)" : "var(--bible-green)";
    const accentDeepVar = id === "old" ? "#3F2AAE" : "#1E6E4C";
    const softVar = id === "old" ? "var(--bible-purple-soft)" : "var(--bible-green-soft)";
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percent / 100);
    return (
      <button
        onClick={() => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))}
        className="relative overflow-hidden text-center rounded-[28px] pt-7 pb-6 px-4 transition-transform active:scale-[0.98] shadow-[0_14px_32px_-16px_rgba(36,28,61,0.32)] ring-1 ring-black/[0.04]"
        style={{ backgroundImage: `linear-gradient(165deg, ${softVar} 0%, #FFFFFF 115%)` }}
      >
        {/* Oversized, near-invisible icon watermark — a soft texture behind
            the centered ring+title composition below. */}
        <Icon size={116} strokeWidth={1.1} className="absolute -right-6 -bottom-8 opacity-[0.07] pointer-events-none" style={{ color: accentDeepVar }} />

        <div className="relative mx-auto mb-4 w-20 h-20">
          <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="white" strokeOpacity="0.65" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={accentVar}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <span
            className="absolute inset-[10px] rounded-full flex items-center justify-center shadow-[0_8px_18px_-6px_rgba(0,0,0,0.4)]"
            style={{ backgroundImage: `linear-gradient(155deg, ${accentVar}, ${accentDeepVar})` }}
          >
            <Icon size={24} className="text-white" />
          </span>
        </div>

        <p className="relative font-abyssinica text-xl font-black leading-tight" style={{ color: "var(--bible-navy)" }}>
          {theme.label}
        </p>
      </button>
    );
  };

  return (
    <div className="bible-scope bg-base min-h-full px-6 py-4 max-w-2xl" style={BIBLE_HOME_THEME}>
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
          <h1 className="font-abyssinica font-bold text-base tracking-tight leading-tight" style={{ color: "var(--bible-navy)" }}>
            መዝሙር
          </h1>
        </button>
        <button
          onClick={handleToggleNotifications}
          disabled={pushBusy}
          aria-label={pushSubscribed ? "Turn off daily verse notifications" : "Turn on daily verse notifications"}
          className={`relative w-9 h-9 rounded-full flex items-center justify-center bg-elevated ring-1 ring-border transition-opacity disabled:opacity-60 ${pushSubscribed ? "" : "text-fg-muted"}`}
          style={pushSubscribed ? { color: "var(--bible-purple)" } : undefined}
        >
          <Bell size={16} fill={pushSubscribed ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Reading Plan — moved to the top of the page (above the hero) so
          it's the first thing visible. Repurposes the real Old/New
          Testament reading progress (see comment above oldPercent/
          newPercent) into this card look, rather than inventing a
          fictional day-count plan the app has no data for. */}
      <div className="mb-5">
        <div className="grid grid-cols-2 gap-3">
          <ReadingPlanCard id="old" />
          <ReadingPlanCard id="new" />
        </div>
        {expanded.old && (
          <div className="mt-3">
            <BookList books={oldTestament} theme={TESTAMENT_THEME.old} />
          </div>
        )}
        {expanded.new && (
          <div className="mt-3">
            <BookList books={newTestament} theme={TESTAMENT_THEME.new} />
          </div>
        )}
      </div>

      {/* Hero — a single "verse of the day" card (one per local calendar
          day, see the fetch effect above), backed by a real photo
          (public/bible/hero/sunset-verse.jpg) instead of the SVG scene. */}
      {!heroVerse ? (
        <div className="w-full h-[190px] rounded-3xl mb-3 animate-pulse" style={{ background: "var(--bible-purple-soft)" }} />
      ) : (
        <div className="relative w-full h-[190px] rounded-3xl overflow-hidden shadow-[0_20px_45px_-18px_rgba(36,28,61,0.35)] mb-3">
          <img
            src="/bible/hero/sunset-verse.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
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
          <div className="relative h-full flex flex-col justify-end p-4 pointer-events-none">
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/90 text-[9px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 mb-2"
              style={{ color: "var(--bible-purple)" }}
            >
              <Sun size={11} strokeWidth={2.5} />
              የዕለቱ ቃል
            </span>
            <p className="font-abyssinica text-[1rem] font-bold text-white leading-snug mb-1.5 line-clamp-2 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
              {heroVerse.text}
            </p>
            <p className="text-[11px] font-semibold text-white/90 mb-2.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">{heroVerse.ref}</p>
            <button
              onClick={() => openVerse(heroVerse.slug, heroVerse.chapter, heroVerse.verseIndex)}
              className="pointer-events-auto w-fit flex items-center gap-1.5 rounded-full text-white text-xs font-bold pl-3 pr-4 py-2 shadow-lg active:scale-95 transition-transform"
              style={{ background: "var(--bible-navy)" }}
            >
              <BookOpen size={13} />
              ሙሉውን ያንብቡ
            </button>
          </div>
        </div>
      )}

      {/* Quick Access — Bookmarks / Notes / History / Favorites in one card. */}
      <div className="rounded-2xl mb-5 shadow-sm overflow-hidden" style={{ background: "var(--color-elevated)" }}>
        <div className="grid grid-cols-4">
          {QUICK_ACCESS.map((item, i) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex flex-col items-center gap-2 py-4 min-w-0 ${i > 0 ? "border-l border-border" : ""}`}
            >
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: "var(--bible-purple-soft)" }}
              >
                <item.icon size={18} style={{ color: "var(--bible-purple)" }} />
              </span>
              <span className="text-xs font-semibold text-center leading-tight w-full truncate" style={{ color: "var(--bible-navy)" }}>
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
              <BookOpen size={16} style={{ color: "var(--bible-navy)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--bible-navy)" }}>
                ንባብ ይቀጥሉ
              </h2>
            </div>
            <button
              onClick={() => setActiveModal("history")}
              className="flex items-center gap-0.5 text-xs font-semibold transition-colors"
              style={{ color: "var(--bible-purple)" }}
            >
              ሁሉንም ይመልከቱ
              <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
            {recentHistory.slice(0, 6).map((entry, i) => {
              const b = bookFromSlug(entry.bookSlug);
              if (!b) return null;
              const percent = Math.round((entry.chapter / b.chapterCount) * 100);
              const accentVar = i % 2 === 0 ? "var(--bible-purple)" : "var(--bible-green)";
              const tileGradient =
                i % 2 === 0
                  ? "linear-gradient(160deg, #6D4FEA, #3B2A85)"
                  : "linear-gradient(160deg, #2F9E6E, #1C5A3E)";
              return (
                <button
                  key={`${entry.bookSlug}-${entry.chapter}`}
                  onClick={() => openVerse(entry.bookSlug, entry.chapter)}
                  className="shrink-0 w-28 rounded-xl p-2.5 text-left shadow-sm"
                  style={{ background: "var(--color-elevated)" }}
                >
                  <div
                    className="w-full h-12 rounded-lg flex items-center justify-between px-2 mb-2"
                    style={{ backgroundImage: tileGradient }}
                  >
                    <span className="font-abyssinica text-white font-bold text-xs leading-tight line-clamp-1">{b.nameAm}</span>
                    <span className="text-white/80 text-[10px] font-semibold shrink-0">{entry.chapter}</span>
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
