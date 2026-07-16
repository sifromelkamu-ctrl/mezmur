import {
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Cross,
  Flame,
  Heart,
  Loader2,
  Pause,
  ScrollText,
  Search,
  Settings2,
  Share2,
  StickyNote,
  Sunrise,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BIBLE_BOOKS } from "../data/bibleBooks";
import { useTheme } from "../context/ThemeContext";
import BibleListModal, { type BibleListModalRow } from "../components/bible/BibleListModal";
import TextAreaField from "../components/form/TextAreaField";
import TextField from "../components/form/TextField";
import { MORNING_VERSES } from "../data/morningVerses";
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

// Highlights specific keywords inline within a verse — used by the Bible
// home screen's hero banner (Psalm 119:105, "lamp"/"light" picked out in
// gold), matching the reference design's emphasized key words.
function renderHighlightedVerse(text: string, keywords: string[]) {
  if (keywords.length === 0) return text;
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  return text.split(pattern).map((part, i) =>
    keywords.includes(part) ? (
      <span key={i} className="text-gold-glow">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function Bible() {
  const { mode } = useTheme();
  const isLight = mode === "light";
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
  const [dailyVerse, setDailyVerse] = useState<
    { ref: string; text: string; slug: string; chapter: number; verseIndex: number } | null
  >(null);
  const [heroVerse, setHeroVerse] = useState<{ ref: string; text: string } | null>(null);
  const [activeModal, setActiveModal] = useState<"bookmarks" | "notes" | "favorites" | "history" | null>(null);
  const [dailyVerseShared, setDailyVerseShared] = useState(false);

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

  // Pick one encouraging verse per local calendar day — since it keys off
  // each visitor's own device clock, it naturally rotates at their own
  // midnight regardless of time zone, no server-side scheduling needed.
  useEffect(() => {
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    let hash = 0;
    for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
    const pick = MORNING_VERSES[hash % MORNING_VERSES.length];
    fetch(`/bible/${pick.slug}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: BookText) => {
        const text = data[String(pick.chapter)]?.[pick.verseIndex];
        if (text) setDailyVerse({ ref: pick.refAm, text, slug: pick.slug, chapter: pick.chapter, verseIndex: pick.verseIndex });
      })
      .catch(() => {});
  }, []);

  // Fixed "brand anchor" verse for the home screen's big hero banner (Psalm
  // 119:105, "Your word is a lamp to my feet") — fetched from the real data
  // file rather than typed inline so the Amharic text is guaranteed exact,
  // not retyped from a reference image.
  useEffect(() => {
    fetch("/bible/psalms.json")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: BookText) => {
        const text = data["119"]?.[104];
        if (text) setHeroVerse({ ref: "መዝሙረ ዳዊት 119:105", text });
      })
      .catch(() => {});
  }, []);

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
              className="w-full pl-10 pr-9 py-2.5 text-base"
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
            <h1 className={`font-agbalumo text-2xl font-black tracking-tight truncate ${WORD_ART_TITLE}`}>
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
                          s === "sm" ? "text-xs" : s === "md" ? "text-sm" : s === "lg" ? "text-base" : "text-lg"
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
                        <span className={`block text-base leading-none mb-1 ${FONT_FAMILY_CLASSES[f]}`}>ብርሃን</span>
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
                        className="w-full px-3 py-2 text-base resize-none"
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
            <h1 className={`font-agbalumo text-xl font-bold ${WORD_ART_TITLE}`}>{book.nameAm}</h1>
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
      icon: ScrollText,
      accent: "text-accent-violet",
      dot: "bg-accent-violet",
      ring: "ring-accent-violet/40",
      glow: "shadow-[0_0_18px_rgba(139,92,246,0.25)]",
      iconBg: "bg-gradient-to-br from-accent-violet/25 to-transparent",
      badgeBg: "bg-accent-violet/15 text-accent-violet",
      label: "ብሉይ ኪዳን",
    },
    new: {
      icon: Flame,
      accent: "text-accent-green",
      dot: "bg-accent-green",
      ring: "ring-accent-green/40",
      glow: "shadow-[0_0_18px_rgba(20,184,102,0.25)]",
      iconBg: "bg-gradient-to-br from-accent-green/25 to-transparent",
      badgeBg: "bg-accent-green/15 text-accent-green",
      label: "አዲስ ኪዳን",
    },
  } as const;

  // Old/New Testament reading progress — distinct chapters ever opened,
  // divided by each testament's true chapter total (BIBLE_BOOKS.chapterCount
  // sums), not capped by the recency log below.
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
  const readPercent = { old: oldPercent, new: newPercent } as const;

  const recentHistory = getRecentHistory(8);

  const openVerse = (slug: string, chapterNum: number, verseIndex: number | null = null) => {
    setActiveModal(null);
    setBookSlug(slug);
    setChapter(chapterNum);
    setJumpToVerse(verseIndex);
  };

  const startReading = () => {
    const recent = getRecentHistory(1)[0];
    if (recent) openVerse(recent.bookSlug, recent.chapter);
    else openVerse("genesis", 1);
  };

  const handleShareDailyVerse = async () => {
    if (!dailyVerse) return;
    const text = `“${dailyVerse.text}” — ${dailyVerse.ref}`;
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
      setDailyVerseShared(true);
      setTimeout(() => setDailyVerseShared(false), 1800);
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
            <p className="font-abyssinica font-medium text-base text-gold truncate">{b.nameAm}</p>
          </div>
          <span className="text-[10px] text-fg-subtle shrink-0">{b.chapterCount} ምዕራፍ</span>
          <ChevronRight size={16} className="text-fg-subtle shrink-0" />
        </button>
      ))}
    </div>
  );

  // Testament stat card — icon, book count, and a real reading-progress bar
  // (replaces the old plain expand row); still toggles the book list below
  // it open/closed on click, same interaction as before.
  const TestamentProgressCard = ({
    id,
    books,
  }: {
    id: "old" | "new";
    books: typeof BIBLE_BOOKS;
  }) => {
    const isOpen = expanded[id];
    const theme = TESTAMENT_THEME[id];
    const Icon = theme.icon;
    const percent = readPercent[id];
    return (
      <button
        onClick={() => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))}
        className={`text-left p-3.5 transition-colors hover:bg-white/5 ${id === "new" ? "border-l border-border" : ""}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${theme.iconBg} ring-1 ${theme.ring} ${theme.glow}`}>
            <Icon size={15} className={theme.accent} />
          </div>
          <ChevronDown
            size={14}
            className={`shrink-0 transition-transform ${isOpen ? `rotate-180 ${theme.accent}` : "text-fg-subtle"}`}
          />
        </div>
        <p className="font-abyssinica text-sm font-bold text-fg truncate">
          {id === "old" ? "ብሉይ ኪዳን" : "አዲስ ኪዳን"}
        </p>
        <p className="text-[10px] text-fg-muted mb-2">{books.length} መጻሕፍት</p>
        <div className="h-1.5 rounded-full bg-black/15 overflow-hidden mb-1">
          <div className={`h-full rounded-full ${theme.dot}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[9px] font-semibold text-fg-subtle">ንባብ {percent}%</p>
      </button>
    );
  };

  return (
    <div className="bible-scope bg-base min-h-full px-6 py-4 max-w-2xl">
      {/* Hero — a featured verse (Psalm 119:105, fetched from the real book
          data) instead of a plain title card, with two keywords picked out
          in gold and a CTA straight into reading. Warm amber/candlelight
          tones stand in for the reference photo (an open Bible + candle) —
          no stock photography is sourced into the app, so the same mood is
          built from gradients + a soft glow instead. Kept deliberately
          compact (small padding, single-line clamp) — this whole page is
          meant to read as one non-scrolling screen. */}
      <button
        onClick={startReading}
        className="relative w-full text-left rounded-2xl overflow-hidden mb-3 border border-gold/20 shadow-2xl active:scale-[0.99] transition-transform"
        style={{
          backgroundImage: isLight
            ? "linear-gradient(135deg, #fff3dd 0%, #fbe4b8 45%, #edc888 100%)"
            : "linear-gradient(135deg, #2b1608 0%, #1a0f05 55%, #0b0603 100%)",
        }}
      >
        <div
          className="absolute -right-12 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-3xl pointer-events-none"
          style={{
            background: isLight ? "rgba(243,201,105,0.5)" : "rgba(243,201,105,0.22)",
            animation: "orb-float 6s ease-in-out infinite",
          }}
        />
        <Cross
          size={90}
          className={`absolute -right-4 -bottom-6 rotate-6 pointer-events-none ${isLight ? "text-black/[0.05]" : "text-white/[0.04]"}`}
        />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, ${isLight ? "#3a2a12" : "#fff"} 1px, transparent 1px)`,
            backgroundSize: "16px 16px",
          }}
        />

        <div className="relative px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {heroVerse ? (
              <>
                <p className="font-agbalumo text-sm leading-snug text-fg mb-1 line-clamp-2">
                  {renderHighlightedVerse(heroVerse.text, ["መብራት", "ብርሃን"])}
                </p>
                <p className="text-[10px] font-semibold text-gold/80">{heroVerse.ref}</p>
              </>
            ) : (
              <div className="h-8" />
            )}
          </div>
          <ChevronRight size={16} className={isLight ? "text-black/40 shrink-0" : "text-gold/60 shrink-0"} />
        </div>
      </button>

      {/* Quick Access — no heading, matches the rest of the page's push to
          stay compact and non-scrolling. */}
      <div className="mb-3">
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACCESS.map((item) => (
            <button key={item.id} onClick={item.onClick} className="flex flex-col items-center gap-1 min-w-0">
              <span
                className="tile-glow w-10 h-10 rounded-full flex items-center justify-center ring-1 ring-white/25"
                style={
                  {
                    "--tile-glow": "color-mix(in oklab, var(--color-gold) 60%, transparent)",
                    background:
                      "radial-gradient(120% 120% at 30% 22%, color-mix(in oklab, var(--color-gold) 45%, white) 0%, var(--color-gold) 55%, color-mix(in oklab, var(--color-gold) 80%, black) 100%)",
                  } as CSSProperties
                }
              >
                <item.icon size={15} className="text-[#3a2410]" />
              </span>
              <span className="text-[10px] font-semibold text-fg-muted text-center leading-tight w-full truncate">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Daily verse — a different verse from the hero, rotates once per
          local calendar day (see the fetch effect above). Same rule as the
          hero above: the reference design's photo (a sunrise over
          mountains) isn't sourced as a real image — a warm sunrise-toned
          gradient (gold glow at top-right fading down into dusk) stands in
          for it instead, matching this card's own "የሃራ ቀል"/Sunrise-icon
          theme far more than the previous flat indigo did. */}
      {dailyVerse && (
        <div
          className="relative overflow-hidden rounded-xl p-4 mb-3"
          style={{
            backgroundImage: isLight
              ? "radial-gradient(130% 110% at 88% -15%, #fff6df 0%, #fbe4b0 20%, #f0c988 42%, #dba668 62%, #c98f5c 100%)"
              : "radial-gradient(130% 110% at 88% -15%, #f3c969 0%, #d98f3c 20%, #7a4a24 45%, #2e1c10 72%, #120b06 100%)",
            animation: "verse-fade-in 0.6s ease-out",
          }}
        >
          <div
            className="absolute -right-4 -top-4"
            style={{ animation: "verse-glow-pulse 4s ease-in-out infinite", color: isLight ? "#6b3a12" : undefined }}
          >
            <Sunrise size={70} className={isLight ? "" : "text-gold"} />
          </div>
          <button
            onClick={handleShareDailyVerse}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center bg-black/15 hover:bg-black/25 transition-colors"
            aria-label="Share verse"
          >
            {dailyVerseShared ? (
              <Check size={13} style={{ color: isLight ? "#6b3a12" : undefined }} className={isLight ? "" : "text-gold"} />
            ) : (
              <Share2 size={13} className="text-fg/70" />
            )}
          </button>
          {/* This card's own accent — the shared gold token is tuned for a
              neutral background, and reads as near-invisible gold-on-gold
              against the warm sunrise gradient above in light mode, so it
              gets its own deep amber/brown here instead (dark mode's
              background stays dark enough that the shared gold is still
              plenty legible, unchanged). */}
          <div className="relative flex items-center gap-1.5 mb-1.5" style={{ color: isLight ? "#6b3a12" : undefined }}>
            <Sunrise size={13} className={isLight ? "" : "text-gold"} />
            <h3
              className={`text-xs font-black uppercase tracking-widest ${isLight ? "" : WORD_ART_TITLE}`}
              style={isLight ? { color: "#5c3410" } : undefined}
            >
              የዕለቱ መና
            </h3>
          </div>
          <p className="relative font-menbere italic text-sm text-fg/90 leading-relaxed line-clamp-3">
            “{dailyVerse.text}”
          </p>
          <div className="relative flex items-center justify-between mt-2">
            <button
              onClick={() => openVerse(dailyVerse.slug, dailyVerse.chapter, dailyVerse.verseIndex)}
              className={`flex items-center gap-1 text-[11px] font-bold transition-colors ${
                isLight ? "hover:opacity-75" : "text-gold hover:text-gold-glow"
              }`}
              style={isLight ? { color: "#6b3a12" } : undefined}
            >
              ሙሉ ቃል ያንብቡ
              <ChevronRight size={12} />
            </button>
            <p
              className={`text-[10px] font-semibold ${isLight ? "" : "text-gold/80"}`}
              style={isLight ? { color: "#6b3a12" } : undefined}
            >
              {dailyVerse.ref}
            </p>
          </div>
        </div>
      )}

      {/* Books — a single unified card holding both testaments side by side
          (redesigned from two separate square cards) so the gold/green
          accents read as one cohesive piece instead of two disconnected
          tiles; still toggles the same book list open/closed beneath it. */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-fg-muted">መጻሕፍት</h2>
          <button
            onClick={() => setExpanded({ old: true, new: true })}
            className="flex items-center gap-0.5 text-xs font-semibold text-gold hover:text-gold-glow transition-colors"
          >
            ሁሉንም ይመልከቱ
            <ChevronRight size={12} />
          </button>
        </div>
        <div
          className="rounded-2xl overflow-hidden border border-border shadow-lg"
          style={{
            backgroundImage: isLight
              ? "linear-gradient(90deg, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.03) 48%, rgba(20,184,102,0.03) 52%, rgba(20,184,102,0.10) 100%)"
              : "linear-gradient(90deg, rgba(139,92,246,0.14) 0%, rgba(10,10,14,0.65) 48%, rgba(10,10,14,0.65) 52%, rgba(20,184,102,0.14) 100%)",
          }}
        >
          <div className="grid grid-cols-2">
            <TestamentProgressCard id="old" books={oldTestament} />
            <TestamentProgressCard id="new" books={newTestament} />
          </div>
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

      {/* Recently Read */}
      {recentHistory.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-fg-muted">በቅርብ የተነበቡ</h2>
            <button
              onClick={() => setActiveModal("history")}
              className="flex items-center gap-0.5 text-xs font-semibold text-gold hover:text-gold-glow transition-colors"
            >
              ሁሉንም ይመልከቱ
              <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {recentHistory.map((entry) => {
              const b = bookFromSlug(entry.bookSlug);
              if (!b) return null;
              const theme = TESTAMENT_THEME[b.testament];
              return (
                <button
                  key={`${entry.bookSlug}-${entry.chapter}`}
                  onClick={() => openVerse(entry.bookSlug, entry.chapter)}
                  className="shrink-0 w-32 bg-elevated hover:bg-elevated-hover rounded-xl p-3 text-left transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[9.5px] font-bold uppercase ${theme.accent}`}>{theme.label}</span>
                    <Bookmark size={13} className="text-fg-subtle shrink-0" />
                  </div>
                  <p className="font-abyssinica text-sm font-bold text-fg truncate">
                    {b.nameAm} {entry.chapter}
                  </p>
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
