import {
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Droplet,
  GalleryHorizontal,
  Globe2,
  Info,
  Library,
  LogOut,
  Mic2,
  Moon,
  Palette,
  Pencil,
  Send,
  Sparkles,
  Sun,
  UserCircle2,
  Clapperboard,
  X as XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import TextField from "../components/form/TextField";
import { useAuth } from "../context/useAuth";
import { useLanguage } from "../context/LanguageContext";
import { useLyricsSetting } from "../context/LyricsContext";
import { ACCENT_THEMES, AVATAR_COLOR_OPTIONS, CUSTOM_THEME_ID, useTheme } from "../context/ThemeContext";
import { useSubscription } from "../context/useSubscription";
import { LANGUAGES } from "../i18n/translations";
import { ApiError, subscriptionApi, type ApiSubscriptionState } from "../lib/api";

type Section = "account" | "subscription" | "appearance" | "language" | "lyrics" | "about";

function SettingsRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-hover transition-colors text-left"
    >
      <span className="text-brand shrink-0">{icon}</span>
      <span className="flex-1 font-semibold text-sm">{label}</span>
      {value && <span className="text-sm text-fg-muted truncate max-w-[40%]">{value}</span>}
      <ChevronRight size={18} className="text-fg-subtle shrink-0" />
    </button>
  );
}

// Unlike SettingsRow, this fires an action directly (no chevron — it
// doesn't navigate into a subsection) and is styled destructively since
// it ends the session.
function LogOutRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-hover transition-colors text-left text-accent-red"
    >
      <span className="shrink-0">
        <LogOut size={20} />
      </span>
      <span className="flex-1 font-semibold text-sm">Log out</span>
    </button>
  );
}

function ConfirmLogoutModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-elevated rounded-2xl p-5 w-full max-w-md my-auto shadow-2xl">
        <h3 className="text-base font-bold mb-1.5">Log out?</h3>
        <p className="text-sm text-fg-muted mb-5">You'll need to log back in to access your account.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-full bg-elevated-hover text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-full bg-accent-red text-white text-sm font-semibold"
          >
            Log out
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-6 -ml-2">
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors shrink-0"
        aria-label="Back to settings"
      >
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Human summary for every combination the subscription status can be in —
// kept as one pure function rather than scattered ternaries in the JSX
// below, since there are enough branches (trial vs. paid, several Stripe
// statuses, the "canceled but still paid through" grace window) that
// inlining them would be hard to read.
function describeSubscription(status: ApiSubscriptionState, isAdmin: boolean): { title: string; subtitle: string } {
  if (isAdmin) {
    return { title: "Admin access", subtitle: "Admins always have full access, regardless of billing." };
  }
  if (status.subscriptionStatus === "comped") {
    return { title: "Complimentary access", subtitle: "Granted by Mezmur — no billing required." };
  }
  if (status.subscriptionStatus === "active" || status.subscriptionStatus === "trialing") {
    return { title: "Mezmur Premium", subtitle: `Renews ${formatDate(status.subscriptionCurrentPeriodEnd ?? status.trialEndsAt)}` };
  }
  if (status.subscriptionStatus === "past_due") {
    return { title: "Payment needs attention", subtitle: "Your last renewal failed — update your billing to keep full access." };
  }
  if (status.subscriptionStatus === "canceled") {
    return status.hasFullAccess
      ? { title: "Subscription canceled", subtitle: `Full access continues until ${formatDate(status.subscriptionCurrentPeriodEnd ?? status.trialEndsAt)}` }
      : { title: "Subscription ended", subtitle: "Resubscribe to unlock full-song playback again." };
  }
  // subscriptionStatus === "none"
  if (status.hasFullAccess) {
    const daysLeft = Math.max(0, Math.ceil((new Date(status.trialEndsAt).getTime() - Date.now()) / 86_400_000));
    return { title: "Free trial", subtitle: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — ends ${formatDate(status.trialEndsAt)}` };
  }
  return { title: "Trial ended", subtitle: "Subscribe to keep listening to full songs, not just 30-second previews." };
}

function SubscriptionSection({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status, loading, refresh } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lands here from Stripe's success_url/cancel_url after a checkout
  // round-trip (see server/src/routes/subscription.ts) — a webhook may not
  // have landed yet, so refresh once rather than trusting a stale cache,
  // then strip the query param so a manual page refresh doesn't re-trigger it.
  useEffect(() => {
    if (!searchParams.get("subscription")) return;
    refresh();
    setSearchParams(
      (params) => {
        params.delete("subscription");
        return params;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    // Opened synchronously, still inside the click's user-gesture context —
    // an iOS home-screen PWA (standalone display mode) can silently swallow
    // a `window.location.href` reassignment issued after the `await` below,
    // since the browser no longer sees it as tied to a real tap by then.
    // Setting this already-open window's location once the URL is ready
    // reliably breaks out to Stripe's checkout regardless.
    const popup = window.open("", "_blank");
    try {
      const { url } = await subscriptionApi.checkout();
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (err) {
      popup?.close();
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setError(null);
    setBusy(true);
    const popup = window.open("", "_blank");
    try {
      const { url } = await subscriptionApi.portal();
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (err) {
      popup?.close();
      setError(err instanceof ApiError ? err.message : "Could not open billing portal.");
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-6 max-w-2xl">
      <SectionHeader title="Subscription" onBack={onBack} />
      {!user ? (
        <div className="bg-elevated rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-fg-muted">Sign in to see your subscription status.</p>
          <button
            onClick={() => navigate("/auth")}
            className="bg-brand text-black text-sm font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform shrink-0"
          >
            Log in
          </button>
        </div>
      ) : loading || !status ? (
        <div className="bg-elevated rounded-lg p-4">
          <p className="text-sm text-fg-muted">Loading…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-elevated rounded-lg p-4">
            {(() => {
              const { title, subtitle } = describeSubscription(status, user?.role === "admin");
              return (
                <>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-fg-muted mt-0.5">{subtitle}</p>
                </>
              );
            })()}
          </div>

          {error && <p className="text-sm text-red-400 px-1">{error}</p>}

          {!status.billingConfigured ? (
            <p className="text-xs text-fg-subtle px-1">Subscriptions aren't set up yet — check back soon.</p>
          ) : user?.role === "admin" || status.subscriptionStatus === "comped" ? null : status.subscriptionStatus ===
              "none" || (status.subscriptionStatus === "canceled" && !status.hasFullAccess) ? (
            <button
              onClick={startCheckout}
              disabled={busy}
              className="text-black text-sm font-bold px-4 py-3 rounded-full hover:scale-[1.02] transition-transform disabled:opacity-60"
              style={{ background: "var(--color-gold)" }}
            >
              {busy ? "Starting checkout…" : "Subscribe — $3.99/month"}
            </button>
          ) : (
            <button
              onClick={openPortal}
              disabled={busy}
              className="bg-elevated-hover hover:bg-hover-strong transition-colors text-sm font-semibold px-4 py-3 rounded-full disabled:opacity-60"
            >
              {busy ? "Opening billing…" : "Manage subscription"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateName } = useAuth();
  const {
    themeId,
    setThemeId,
    mode,
    setMode,
    avatarColorId,
    setAvatarColorId,
    customColor,
    setCustomColor,
    nowPlayingThemeId,
    setNowPlayingThemeId,
    nowPlayingCustomColor,
    setNowPlayingCustomColor,
  } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { lyricsEnabled, setLyricsEnabled } = useLyricsSetting();
  const { status: subscriptionStatus } = useSubscription();
  // Lets a caller (e.g. the notification panel's "Go Premium" card) deep-
  // link straight into a section instead of landing on the plain list —
  // passed via navigate("/settings", { state: { section: "subscription" } }).
  const [section, setSection] = useState<Section | null>(
    () => (location.state as { section?: Section } | null)?.section ?? null
  );
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const currentLanguage = LANGUAGES.find((l) => l.id === language)?.nativeName ?? "English";

  const startEditName = () => {
    setNameDraft(user?.name ?? "");
    setEditingName(true);
  };

  const saveName = async () => {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    try {
      await updateName(nameDraft.trim());
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  let content: ReactNode;

  if (section === "account") {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <SectionHeader title="Account" onBack={() => setSection(null)} />
        <div className="bg-elevated rounded-lg p-4">
          {user ? (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs text-fg-muted mb-1">Name</p>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <TextField
                      autoFocus
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveName()}
                      variant="panel"
                      className="px-3 py-2 text-base flex-1"
                    />
                    <button
                      onClick={saveName}
                      disabled={!nameDraft.trim() || savingName}
                      className="w-9 h-9 shrink-0 rounded-md bg-brand text-black flex items-center justify-center disabled:opacity-50"
                      aria-label="Save name"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="w-9 h-9 shrink-0 rounded-md text-fg-muted hover:text-fg flex items-center justify-center"
                      aria-label="Cancel editing"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold truncate">{user.name || "Add your name"}</p>
                    <button
                      onClick={startEditName}
                      className="text-fg-muted hover:text-fg shrink-0"
                      aria-label="Edit name"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-fg-muted mb-1">{user.email ? "Email" : "Phone"}</p>
                <p className="text-sm truncate">{user.email ?? user.phone}</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted mb-1">Subscription</p>
                {!subscriptionStatus ? (
                  <p className="text-sm text-fg-muted">Loading…</p>
                ) : (
                  (() => {
                    const { title, subtitle } = describeSubscription(subscriptionStatus, user.role === "admin");
                    return (
                      <button
                        onClick={() => setSection("subscription")}
                        className="flex items-center justify-between gap-2 w-full text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{title}</p>
                          <p className="text-xs text-fg-muted mt-0.5 truncate">{subtitle}</p>
                        </div>
                        <ChevronRight size={16} className="text-fg-subtle shrink-0" />
                      </button>
                    );
                  })()
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-fg-muted">You're not logged in yet.</p>
              <button
                onClick={() => navigate("/auth")}
                className="bg-brand text-black text-sm font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform shrink-0"
              >
                {t("logIn")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  } else if (section === "subscription") {
    content = <SubscriptionSection onBack={() => setSection(null)} />;
  } else if (section === "appearance") {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <SectionHeader title="Appearance" onBack={() => setSection(null)} />
        <div className="flex flex-col gap-6">
          <div className="bg-elevated rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Light / Dark</p>
            <p className="text-sm text-fg-muted mb-4">Choose a light or dark background for the whole app.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setMode("dark")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors ${
                  mode === "dark"
                    ? "bg-white text-black border-transparent"
                    : "border-border text-fg-muted hover:text-fg"
                }`}
              >
                <Moon size={16} />
                Dark
              </button>
              <button
                onClick={() => setMode("light")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors ${
                  mode === "light"
                    ? "bg-white text-black border-transparent shadow"
                    : "border-border text-fg-muted hover:text-fg"
                }`}
              >
                <Sun size={16} />
                Light
              </button>
            </div>
          </div>

          <div className="bg-elevated rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Accent color</p>
            <p className="text-sm text-fg-muted mb-4">
              For buttons, highlights, and glows throughout the app. Choose a preset or set any color of your own —
              the Now Playing screen has its own separate color below.
            </p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setThemeId(theme.id)}
                  className="flex flex-col items-center gap-2 group"
                  aria-label={`Use ${theme.name} theme`}
                >
                  <span
                    className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-border transition-all"
                    style={{ backgroundImage: `linear-gradient(135deg, ${theme.brand}, ${theme.brandDark})` }}
                  >
                    {themeId === theme.id && <Check size={18} className="text-black" strokeWidth={3} />}
                  </span>
                  <span className="text-xs text-fg-muted">{theme.name}</span>
                </button>
              ))}
              {/* Native color picker (an <input type="color"> visually hidden
                  behind the swatch, opened via the label wrapping it) — the
                  simplest way to a system color picker on every platform
                  this app targets (iOS/Android WebView + desktop browsers)
                  without shipping a custom color-wheel component. */}
              <label className="flex flex-col items-center gap-2 group cursor-pointer">
                <span
                  className="relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-border transition-all overflow-hidden"
                  style={{
                    backgroundImage:
                      themeId === CUSTOM_THEME_ID
                        ? `linear-gradient(135deg, ${customColor}, ${customColor})`
                        : "conic-gradient(from 180deg, #e0483c, #f3c969, #059669, #2563eb, #7c5cff, #db2777, #e0483c)",
                  }}
                >
                  {themeId === CUSTOM_THEME_ID ? (
                    <Check size={18} className="text-black" strokeWidth={3} />
                  ) : (
                    <Droplet size={18} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                  )}
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Choose a custom accent color"
                  />
                </span>
                <span className="text-xs text-fg-muted">Custom</span>
              </label>
            </div>
          </div>

          <div className="bg-elevated rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Now Playing color</p>
            <p className="text-sm text-fg-muted mb-4">
              Just for the Now Playing screen's background — independent of your accent color above.
            </p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setNowPlayingThemeId(theme.id)}
                  className="flex flex-col items-center gap-2 group"
                  aria-label={`Use ${theme.name} for Now Playing`}
                >
                  <span
                    className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-border transition-all"
                    style={{ backgroundImage: `linear-gradient(135deg, ${theme.brand}, ${theme.brandDark})` }}
                  >
                    {nowPlayingThemeId === theme.id && <Check size={18} className="text-black" strokeWidth={3} />}
                  </span>
                  <span className="text-xs text-fg-muted">{theme.name}</span>
                </button>
              ))}
              <label className="flex flex-col items-center gap-2 group cursor-pointer">
                <span
                  className="relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-border transition-all overflow-hidden"
                  style={{
                    backgroundImage:
                      nowPlayingThemeId === CUSTOM_THEME_ID
                        ? `linear-gradient(135deg, ${nowPlayingCustomColor}, ${nowPlayingCustomColor})`
                        : "conic-gradient(from 180deg, #e0483c, #f3c969, #059669, #2563eb, #7c5cff, #db2777, #e0483c)",
                  }}
                >
                  {nowPlayingThemeId === CUSTOM_THEME_ID ? (
                    <Check size={18} className="text-black" strokeWidth={3} />
                  ) : (
                    <Droplet size={18} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                  )}
                  <input
                    type="color"
                    value={nowPlayingCustomColor}
                    onChange={(e) => setNowPlayingCustomColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Choose a custom Now Playing color"
                  />
                </span>
                <span className="text-xs text-fg-muted">Custom</span>
              </label>
            </div>
          </div>

          <div className="bg-elevated rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Avatar color</p>
            <p className="text-sm text-fg-muted mb-4">
              For the "M" mark in the header — independent of your accent color, defaults to white.
            </p>
            <div className="flex flex-wrap gap-3">
              {AVATAR_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAvatarColorId(opt.id)}
                  className="flex flex-col items-center gap-2 group"
                  aria-label={`Use ${opt.name} avatar color`}
                >
                  <span
                    className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg ring-1 ring-border group-hover:ring-2 group-hover:ring-fg-subtle transition-all"
                    style={{ backgroundColor: opt.color }}
                  >
                    {avatarColorId === opt.id && (
                      <Check size={18} className={opt.id === "white" ? "text-black" : "text-white"} strokeWidth={3} />
                    )}
                  </span>
                  <span className="text-xs text-fg-muted">{opt.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (section === "language") {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <SectionHeader title="Language" onBack={() => setSection(null)} />
        <div className="bg-elevated rounded-lg p-4">
          <p className="text-sm text-fg-muted mb-4">Choose the app's display language.</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  language === lang.id ? "bg-white text-black" : "bg-elevated-hover text-fg-muted hover:bg-hover-strong"
                }`}
              >
                {lang.nativeName}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (section === "lyrics") {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <SectionHeader title="Lyrics" onBack={() => setSection(null)} />
        <div className="bg-elevated rounded-lg p-4">
          <p className="text-sm text-fg-muted mb-4">
            Show AI-generated Amharic lyrics on the Now Playing screen while a song is playing. These are generated
            for the mood of the song and are not the song's official lyrics.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setLyricsEnabled(true)}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors ${
                lyricsEnabled ? "bg-white text-black border-transparent" : "border-border text-fg-muted hover:text-fg"
              }`}
            >
              On
            </button>
            <button
              onClick={() => setLyricsEnabled(false)}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold border transition-colors ${
                !lyricsEnabled ? "bg-white text-black border-transparent" : "border-border text-fg-muted hover:text-fg"
              }`}
            >
              Off
            </button>
          </div>
        </div>
      </div>
    );
  } else if (section === "about") {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <SectionHeader title="About" onBack={() => setSection(null)} />
        <div className="bg-elevated rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shrink-0">
              <Disc3 size={20} className="text-black" />
            </div>
            <div>
              <p className="font-semibold">Mezmur</p>
              <p className="text-xs text-fg-muted">Version 1.0.0</p>
            </div>
          </div>
          <p className="text-sm text-fg-muted">
            A home for Ethiopian gospel music — Amharic, Oromo, and Tigrigna worship, mezmur classics, and the artists
            and worship teams behind them.
          </p>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="px-6 py-6 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">{t("settings")}</h1>
        <div className="bg-elevated rounded-lg divide-y divide-border overflow-hidden">
          <SettingsRow
            icon={<UserCircle2 size={20} />}
            label="Account"
            value={user ? user.name || user.email || user.phone || user.username || "Account" : "Log in"}
            onClick={() => setSection("account")}
          />
          <SettingsRow
            icon={<Sparkles size={20} />}
            label="Subscription"
            value={
              !user
                ? undefined
                : user.role === "admin"
                  ? "Admin"
                  : !subscriptionStatus
                    ? "…"
                    : subscriptionStatus.subscriptionStatus === "comped"
                      ? "Complimentary"
                      : subscriptionStatus.subscriptionStatus === "active" || subscriptionStatus.subscriptionStatus === "trialing"
                        ? "Premium"
                        : subscriptionStatus.hasFullAccess
                          ? "Free trial"
                          : "Ended"
            }
            onClick={() => setSection("subscription")}
          />
          <SettingsRow
            icon={<Palette size={20} />}
            label="Appearance"
            value={mode === "light" ? "Light" : "Dark"}
            onClick={() => setSection("appearance")}
          />
          <SettingsRow
            icon={<Globe2 size={20} />}
            label="Language"
            value={currentLanguage}
            onClick={() => setSection("language")}
          />
          <SettingsRow
            icon={<Mic2 size={20} />}
            label="Lyrics"
            value={lyricsEnabled ? "On" : "Off"}
            onClick={() => setSection("lyrics")}
          />
          <SettingsRow icon={<Info size={20} />} label="About" onClick={() => setSection("about")} />
          {user && <LogOutRow onClick={() => setConfirmingLogout(true)} />}
        </div>

        {user?.role === "admin" && (
          <div className="bg-elevated rounded-lg divide-y divide-border overflow-hidden mt-6">
            <SettingsRow icon={<Disc3 size={20} />} label="Bulk upload tracks" onClick={() => navigate("/admin/upload")} />
            <SettingsRow
              icon={<Clapperboard size={20} />}
              label="Import from YouTube"
              onClick={() => navigate("/admin/youtube-import")}
            />
            <SettingsRow
              icon={<Disc3 size={20} />}
              label="Import artist catalog"
              onClick={() => navigate("/admin/youtube-catalog-import")}
            />
            <SettingsRow
              icon={<Send size={20} />}
              label="Import from Telegram"
              onClick={() => navigate("/admin/telegram-import")}
            />
            <SettingsRow
              icon={<Library size={20} />}
              label="Library Management"
              onClick={() => navigate("/admin/library")}
            />
            <SettingsRow
              icon={<GalleryHorizontal size={20} />}
              label="Home Featured Banner"
              onClick={() => navigate("/admin/featured-banners")}
            />
            <SettingsRow
              icon={<Sparkles size={20} />}
              label="Free Access"
              onClick={() => navigate("/admin/user-access")}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {content}
      {confirmingLogout && (
        <ConfirmLogoutModal
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => {
            setConfirmingLogout(false);
            logout();
          }}
        />
      )}
    </>
  );
}
