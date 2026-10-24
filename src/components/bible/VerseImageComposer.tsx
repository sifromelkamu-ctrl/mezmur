import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { HERO_IMAGES } from "../../data/bibleHeroImages";
import {
  ENGLISH_FONT_FAMILY_LABELS,
  ENGLISH_FONT_FAMILY_OPTIONS,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_OPTIONS,
  type EnglishFontFamily,
  type FontFamily,
} from "../../utils/bibleReadingPrefs";
import { renderVerseCard, shareCanvasAsImage, type VerseImageOverlay } from "../../utils/bibleVerseImage";

// CSS font-family stacks for canvas rendering + live preview, matching the
// --font-* tokens already declared in index.css for these same options
// (BibleSettingsModal's reading-font picker) — same fonts, same names,
// just as literal font-family strings instead of Tailwind classes, since
// canvas text (and this component's own inline preview) needs the raw
// CSS value rather than a class.
const FONT_STACKS: Record<EnglishFontFamily, string> = {
  merriweather: `"Merriweather", serif`,
  lora: `"Lora", serif`,
  ebGaramond: `"EB Garamond", serif`,
  ptSerif: `"PT Serif", serif`,
  inter: `"Inter", sans-serif`,
  playfair: `"Playfair Display", serif`,
};
// Amharic gets its own font picker using the same Ethiopic-capable set
// BibleSettingsModal's main reading-font picker already offers — none of
// the Latin fonts above cover Ethiopic glyphs, so they're not reused here.
const AMHARIC_FONT_STACKS: Record<FontFamily, string> = {
  notoSans: `"Noto Sans Ethiopic", sans-serif`,
  notoSerif: `"Noto Serif Ethiopic", serif`,
  abyssinica: `"Abyssinica SIL", serif`,
  menbere: `"Menbere", sans-serif`,
  agbalumo: `"Agbalumo", cursive`,
  googleSans: `"Google Sans", sans-serif`,
  nyala: `"Nyala", "Noto Sans Ethiopic", sans-serif`,
};

const OVERLAY_OPTIONS: { id: VerseImageOverlay; label: string; previewAlpha: number }[] = [
  { id: "light", label: "Light", previewAlpha: 0.3 },
  { id: "medium", label: "Medium", previewAlpha: 0.48 },
  { id: "dark", label: "Dark", previewAlpha: 0.68 },
];

interface VerseImageComposerProps {
  text: string;
  citation: string;
  language: "am" | "en";
  initialFontFamily?: EnglishFontFamily;
  initialAmharicFontFamily?: FontFamily;
  onClose: () => void;
}

// A verse-selection "create a shareable image" flow modeled on the native
// Bible app's own Image action (pick a background photo, then adjust font
// and legibility before saving) rather than this app's old one-tap "Image"
// button, which generated a single fixed-look card with no choice at all.
// Reuses HERO_IMAGES (the same photo library the Bible home screen's daily
// verse card rotates through) as the background gallery instead of a
// separate curated set.
export default function VerseImageComposer({
  text,
  citation,
  language,
  initialFontFamily,
  initialAmharicFontFamily,
  onClose,
}: VerseImageComposerProps) {
  const [step, setStep] = useState<"pick" | "edit">("pick");
  const [background, setBackground] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<VerseImageOverlay>("medium");
  const [fontFamily, setFontFamily] = useState<EnglishFontFamily>(initialFontFamily ?? "merriweather");
  const [amharicFontFamily, setAmharicFontFamily] = useState<FontFamily>(initialAmharicFontFamily ?? "notoSerif");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fontStack = language === "en" ? FONT_STACKS[fontFamily] : AMHARIC_FONT_STACKS[amharicFontFamily];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const canvas = await renderVerseCard(text, citation, { background, overlay, fontStack });
      await shareCanvasAsImage(canvas, citation, citation);
      setSaved(true);
      setTimeout(onClose, 700);
    } catch {
      // share/download failed or was cancelled — stay on the editor so
      // the user can retry rather than silently closing on them.
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="bible-scope fixed inset-0 z-50 bg-elevated flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {step === "pick" ? (
        <>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <h2 className="text-base font-bold text-fg">Choose Image</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-6">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setBackground(null);
                  setStep("edit");
                }}
                className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-black/[0.06] active:scale-95 transition-transform"
                style={{ background: "linear-gradient(160deg, #2f2552, #241C3D)" }}
              >
                <span className="absolute inset-x-0 bottom-0 pb-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-[#e4c765]">
                  Gradient
                </span>
              </button>
              {/* 79 photos in this grid — plain <img loading="lazy">
                  instead of a CSS background-image, since a background-
                  image has no native lazy-loading equivalent and would
                  fetch all 79 full-size photos the instant this screen
                  opens, not just the handful actually scrolled into
                  view. */}
              {HERO_IMAGES.map((src) => (
                <button
                  key={src}
                  onClick={() => {
                    setBackground(src);
                    setStep("edit");
                  }}
                  className="aspect-square rounded-xl overflow-hidden ring-1 ring-black/[0.06] active:scale-95 transition-transform"
                  aria-label="Use this photo"
                >
                  <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <button
              onClick={() => setStep("pick")}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
              aria-label="Change background"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-base font-bold text-fg">Image</h2>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black text-white text-sm font-semibold disabled:opacity-60 active:scale-95 transition-transform"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <Check size={14} />
              ) : null}
              {saved ? "Saved" : "Save"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-6">
            {/* Live preview — mirrors renderVerseCard's own layout (portrait
                1080x1350, same quote-mark/verse/citation/wordmark stack) in
                plain DOM/CSS rather than re-rasterizing a canvas on every
                keystroke-equivalent state change, so picking a font or
                overlay strength updates instantly. */}
            <div
              className="relative w-full rounded-2xl overflow-hidden mb-4 flex flex-col items-center justify-center text-center px-8 py-10"
              style={{
                aspectRatio: "1080 / 1350",
                backgroundImage: background
                  ? `url(${background})`
                  : "linear-gradient(160deg, #2f2552, #241C3D)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {background && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, rgba(0,0,0,${
                      OVERLAY_OPTIONS.find((o) => o.id === overlay)!.previewAlpha * 0.55
                    }) 0%, rgba(0,0,0,${OVERLAY_OPTIONS.find((o) => o.id === overlay)!.previewAlpha}) 100%)`,
                  }}
                />
              )}
              {!background && (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(120% 90% at 18% 16%, rgba(228,199,101,0.16), transparent 65%)",
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="relative leading-none select-none"
                style={{
                  fontFamily: fontStack,
                  fontSize: "3.2rem",
                  fontWeight: 700,
                  color: background ? "rgba(255,255,255,0.75)" : "#e4c765",
                  marginBottom: "-0.5rem",
                }}
              >
                "
              </span>
              <p
                className="relative font-medium italic leading-snug"
                style={{
                  fontFamily: fontStack,
                  fontSize: "1.15rem",
                  color: background ? "#ffffff" : "#f5f1e9",
                  textShadow: background ? "0 1px 8px rgba(0,0,0,0.5)" : "none",
                }}
              >
                {text}
              </p>
              <p
                className="relative font-semibold mt-4"
                style={{
                  fontFamily: fontStack,
                  fontSize: "0.9rem",
                  color: background ? "rgba(255,255,255,0.9)" : "#d4af37",
                }}
              >
                {citation}
              </p>
              <div
                className="relative mt-3 w-8 h-px"
                style={{ background: background ? "rgba(255,255,255,0.5)" : "rgba(212,175,55,0.5)" }}
              />
              <p
                className="relative font-semibold mt-2 text-[10px] tracking-widest"
                style={{
                  fontFamily: fontStack,
                  color: background ? "rgba(255,255,255,0.65)" : "rgba(245,241,233,0.55)",
                }}
              >
                MEZMUR
              </p>
            </div>

            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted mb-2">Font</p>
              <div className="flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar">
                {language === "en"
                  ? ENGLISH_FONT_FAMILY_OPTIONS.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFontFamily(f)}
                        className={`shrink-0 px-3.5 py-2 rounded-full border text-sm transition-colors ${
                          fontFamily === f
                            ? "bg-[var(--color-gold)] text-black border-transparent font-bold"
                            : "border-border text-fg-muted hover:text-fg"
                        }`}
                        style={{ fontFamily: FONT_STACKS[f] }}
                      >
                        {ENGLISH_FONT_FAMILY_LABELS[f]}
                      </button>
                    ))
                  : FONT_FAMILY_OPTIONS.map((f) => (
                      <button
                        key={f}
                        onClick={() => setAmharicFontFamily(f)}
                        className={`shrink-0 px-3.5 py-2 rounded-full border text-sm transition-colors ${
                          amharicFontFamily === f
                            ? "bg-[var(--color-gold)] text-black border-transparent font-bold"
                            : "border-border text-fg-muted hover:text-fg"
                        }`}
                        style={{ fontFamily: AMHARIC_FONT_STACKS[f] }}
                      >
                        {FONT_FAMILY_LABELS[f]}
                      </button>
                    ))}
              </div>
            </div>

            {background && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted mb-2">Contrast</p>
                <div className="flex gap-2">
                  {OVERLAY_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setOverlay(o.id)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                        overlay === o.id
                          ? "bg-[var(--color-gold)] text-black border-transparent"
                          : "border-border text-fg-muted hover:text-fg"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
