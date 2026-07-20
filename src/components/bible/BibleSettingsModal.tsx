import { ALargeSmall, Bell, BookOpenText, Languages, Moon, Palette, Sun, Type, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ThemeMode } from "../../context/ThemeContext";
import {
  ENGLISH_FONT_FAMILY_CLASSES,
  ENGLISH_FONT_FAMILY_LABELS,
  ENGLISH_FONT_FAMILY_OPTIONS,
  ENGLISH_VERSION_LABELS,
  ENGLISH_VERSION_OPTIONS,
  FONT_FAMILY_CLASSES,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_OPTIONS,
  type FontSize,
  type ReadingPrefs,
} from "../../utils/bibleReadingPrefs";

interface BibleSettingsModalProps {
  prefs: ReadingPrefs;
  updatePrefs: (partial: Partial<ReadingPrefs>) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  pushSubscribed: boolean;
  pushBusy: boolean;
  onToggleNotifications: () => void;
  onClose: () => void;
}

const SELECTED =
  "bg-[var(--color-gold)] text-black border-transparent font-bold shadow-[0_2px_10px_-2px_rgba(0,0,0,0.4)]";
const UNSELECTED = "border-border text-fg-muted hover:text-fg hover:border-fg-subtle";

function Section({ icon: Icon, label, children }: { icon: ComponentType<{ size?: number }>; label: string; children: ReactNode }) {
  return (
    <section
      className="rounded-2xl p-3.5 mb-3"
      style={{
        background: "color-mix(in oklab, var(--color-fg) 4%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-fg) 7%, transparent)",
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2.5">
        <Icon size={13} />
        {label}
      </p>
      {children}
    </section>
  );
}

// One place for everything about how a visitor reads the Bible section —
// language, English translation, Amharic font, text size, light/dark
// appearance, and the daily-verse reminder — instead of these being spread
// across the chapter reader's own small popover and a lone bell icon.
// Portaled to document.body like BibleListModal, for the same stacking-
// context reason documented there.
export default function BibleSettingsModal({
  prefs,
  updatePrefs,
  mode,
  setMode,
  pushSubscribed,
  pushBusy,
  onToggleNotifications,
  onClose,
}: BibleSettingsModalProps) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="bible-scope fixed inset-x-0 bottom-0 z-50 bg-elevated rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 pb-8 shadow-2xl">
        <div className="w-9 h-1 rounded-full bg-fg-subtle/30 mx-auto mb-4" />

        <div className="flex items-center justify-between mb-1">
          <h2 className="font-agbalumo text-xl font-bold text-gold">Bible Settings</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-fg-muted mb-5">Customize how you read and hear scripture.</p>

        <Section icon={Languages} label="ቋንቋ · Language">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updatePrefs({ language: "am" })}
              className={`flex-1 py-2.5 rounded-md font-semibold text-sm border transition-colors ${
                prefs.language === "am" ? SELECTED : UNSELECTED
              }`}
            >
              አማርኛ
            </button>
            <button
              onClick={() => updatePrefs({ language: "en" })}
              className={`flex-1 py-2.5 rounded-md font-semibold text-sm border transition-colors ${
                prefs.language === "en" ? SELECTED : UNSELECTED
              }`}
            >
              English
            </button>
          </div>
        </Section>

        {prefs.language === "en" && (
          <Section icon={BookOpenText} label="Version">
            <div className="grid grid-cols-2 gap-2">
              {ENGLISH_VERSION_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => updatePrefs({ englishVersion: v })}
                  className={`rounded-md border px-2 py-2 text-left transition-colors ${
                    prefs.englishVersion === v ? SELECTED : UNSELECTED
                  }`}
                >
                  <span className="block text-xs font-bold uppercase">{v}</span>
                  <span className="block text-[10px] font-semibold opacity-80 leading-tight">{ENGLISH_VERSION_LABELS[v]}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {prefs.language === "en" && (
          <Section icon={Type} label="Font">
            <div className="grid grid-cols-2 gap-2">
              {ENGLISH_FONT_FAMILY_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => updatePrefs({ englishFontFamily: f })}
                  className={`rounded-md border px-2 py-2 text-left transition-colors ${
                    prefs.englishFontFamily === f ? SELECTED : UNSELECTED
                  }`}
                >
                  <span className={`block text-[1rem] leading-none mb-1 ${ENGLISH_FONT_FAMILY_CLASSES[f]}`}>Aa</span>
                  <span className="block text-[10px] font-semibold opacity-80">{ENGLISH_FONT_FAMILY_LABELS[f]}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {prefs.language === "am" && (
          <Section icon={Type} label="የፊደል ቅርፅ · Amharic font">
            <div className="grid grid-cols-2 gap-2">
              {FONT_FAMILY_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => updatePrefs({ fontFamily: f })}
                  className={`rounded-md border px-2 py-2 text-left transition-colors ${
                    prefs.fontFamily === f ? SELECTED : UNSELECTED
                  }`}
                >
                  <span className={`block text-[1rem] leading-none mb-1 ${FONT_FAMILY_CLASSES[f]}`}>ብርሃን</span>
                  <span className="block text-[10px] font-semibold opacity-80">{FONT_FAMILY_LABELS[f]}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section icon={ALargeSmall} label="የፊደል መጠን · Text size">
          <div className="flex items-center gap-2">
            {(["sm", "md", "lg", "xl"] as FontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => updatePrefs({ fontSize: s })}
                className={`flex-1 py-2 rounded-md font-semibold border transition-colors ${
                  s === "sm" ? "text-xs" : s === "md" ? "text-sm" : s === "lg" ? "text-[1rem]" : "text-lg"
                } ${prefs.fontSize === s ? SELECTED : UNSELECTED}`}
              >
                Aa
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Palette} label="ገጽታ · Appearance">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("light")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md font-semibold text-sm border transition-colors ${
                mode === "light" ? SELECTED : UNSELECTED
              }`}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              onClick={() => setMode("dark")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md font-semibold text-sm border transition-colors ${
                mode === "dark" ? SELECTED : UNSELECTED
              }`}
            >
              <Moon size={14} />
              Dark
            </button>
          </div>
        </Section>

        <Section icon={Bell} label="ማሳሰቢያ · Daily reminder">
          <button
            onClick={onToggleNotifications}
            disabled={pushBusy}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors disabled:opacity-60 ${
              pushSubscribed ? "border-transparent bg-white/10" : "border-border hover:bg-hover"
            }`}
          >
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: pushSubscribed ? "var(--color-gold)" : "var(--color-elevated-hover)" }}
            >
              <Bell size={16} className={pushSubscribed ? "text-black" : "text-fg-muted"} fill={pushSubscribed ? "currentColor" : "none"} />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-semibold text-fg">Daily verse notification</span>
              <span className="block text-xs text-fg-muted mt-0.5">
                {pushSubscribed ? "On — you'll get a daily verse" : "Off — tap to enable"}
              </span>
            </span>
          </button>
        </Section>
      </div>
    </>,
    document.body
  );
}
