import { Search, Settings } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useLanguage } from "../context/LanguageContext";
import { getAvatarColor, useTheme } from "../context/ThemeContext";
import TextField from "./form/TextField";

export default function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSearchPage = location.pathname === "/search";
  const isHome = location.pathname === "/";
  // Library renders its own bespoke header (avatar / centered wordmark /
  // gear) to match its dedicated design, same pattern as Home below.
  const isLibrary = location.pathname === "/library";
  // Bible's home screen renders its own header (avatar / wordmark / tagline
  // / notification bell) in its own light purple palette — same reasoning
  // as Library above.
  const isBible = location.pathname === "/bible";
  // Every hero-photo detail page (artist/album/playlist/podcast/sermon) has
  // its own BackButton + overflow menu already, and pulls its hero up over
  // this bar with a negative top margin so the two never visually double up
  // — but that overlap is a pixel-perfect trick riding on env(safe-area-
  // inset-top), which Android's WebView doesn't always report as reliably
  // as iOS's does. When it under-reports, this bar's own row peeks out as a
  // separate, cramped strip above the hero instead of being fully covered.
  // Not rendering it here at all removes the dependency on that trick
  // matching pixel-for-pixel across platforms, same reasoning as Library/
  // Bible/Home above.
  const isHeroDetailPage = /^\/(artist|album|my-artist|playlist|podcast|sermon)\//.test(location.pathname);
  const { user } = useAuth();
  const { t } = useLanguage();
  const { avatarColorId } = useTheme();
  const avatarColor = getAvatarColor(avatarColorId);

  // Home renders its own header (greeting, notification bell, avatar) —
  // same reasoning as Library/Bible above. Previously Topbar still
  // rendered its sticky/blurred shell here with every child conditionally
  // hidden, which looked empty at the top of the page but became a stray
  // translucent bar once scrolled, since `sticky` keeps painting that
  // background even with no content inside it.
  if (isLibrary || isBible || isHome || isHeroDetailPage) return null;

  const isSettingsPage = location.pathname === "/settings";

  return (
    <header
      className={
        // Settings keeps its original pinned, translucent-blur header —
        // everywhere else, this used to stay sticky at the top with a
        // bg-base/80 blur regardless of what page-specific content (e.g. a
        // detail page's own colorful gradient/photo hero) was scrolling
        // underneath it, reading as a floating overlay in a slightly
        // different shade than the page itself. Scrolling away with the
        // page instead, with no background of its own, removes both the
        // "always-on-top overlay" feel and the color mismatch.
        isSettingsPage ? "sticky top-0 z-10 bg-base/80 backdrop-blur-md" : ""
      }
    >
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!isSearchPage && !isHome && (
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 shrink-0 py-2.5 -my-2.5"
              aria-label={t("home")}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: avatarColor.background }}
              >
                <span className="font-bold text-xs" style={{ color: avatarColor.text }}>
                  M
                </span>
              </div>
              {/* text-lg (1.125rem) + 9% = 1.226rem */}
              <span className="font-abyssinica font-bold text-[1.226rem] tracking-tight bg-gradient-to-r from-gold to-gold-dark bg-clip-text text-transparent">
                መዝሙር
              </span>
            </button>
          )}
        </div>
        {/* Home renders its own compact settings/profile + notification affordance
            in its header, so Topbar stays out of the way there to avoid duplicate
            chrome (see src/pages/Home.tsx). */}
        {!isHome && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/settings")}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                location.pathname === "/settings" ? "text-brand bg-hover" : "text-fg-muted hover:text-fg hover:bg-hover"
              }`}
              aria-label={t("settings")}
            >
              <Settings size={20} />
            </button>
            {!user && (
              <button
                onClick={() => navigate("/auth")}
                className="bg-white text-black text-sm font-bold rounded-full px-5 py-2 hover:scale-105 transition-transform"
              >
                {t("logIn")}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Own full-width row below the icon row — sharing one row with the
          settings/login buttons left too little space and clipped the
          placeholder text. */}
      {isSearchPage && (
        <div className="relative px-4 pb-3">
          <Search size={18} className="absolute left-7 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <TextField
            type="text"
            value={searchParams.get("q") ?? ""}
            onChange={(e) => {
              const q = e.target.value;
              setSearchParams(q ? { q } : {}, { replace: true });
            }}
            placeholder={t("whatDoYouWantToListenTo")}
            pill
            className="pl-10 pr-4 py-2.5 text-sm w-full"
          />
        </div>
      )}
    </header>
  );
}
