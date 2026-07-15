import { Search, Settings } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useLanguage } from "../context/LanguageContext";
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
  const { user } = useAuth();
  const { t } = useLanguage();

  if (isLibrary) return null;

  return (
    <header className="sticky top-0 z-10 bg-base/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!isSearchPage && !isHome && (
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 shrink-0 py-2.5 -my-2.5"
              aria-label={t("home")}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-accent-cyan flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
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
            autoFocus
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
