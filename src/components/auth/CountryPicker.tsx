import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { COUNTRIES, countryFlagEmoji, type Country } from "../../data/countries";

interface CountryPickerProps {
  value: Country;
  onChange: (country: Country) => void;
}

export default function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.code.toLowerCase() === q
    );
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-panel rounded-md px-3 py-2 text-base shrink-0 hover:bg-hover transition-colors"
      >
        <span className="text-lg leading-none">{countryFlagEmoji(value.code)}</span>
        <span className="font-medium tabular-nums">{value.dialCode}</span>
        <ChevronDown size={14} className="text-fg-subtle" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex flex-col bg-black/60 backdrop-blur-sm bg-crossfade">
            <div className="mt-auto sm:m-auto w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-elevated max-h-[80vh] flex flex-col shadow-2xl auth-sheet">
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <h3 className="font-bold text-base text-fg">Select a country</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-4 pb-3 shrink-0">
                <div className="flex items-center gap-2 bg-panel rounded-full px-3.5 py-2.5">
                  <Search size={16} className="text-fg-subtle shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search country or code"
                    className="bg-transparent outline-none text-sm w-full placeholder:text-fg-subtle"
                  />
                </div>
              </div>

              <div className="overflow-y-auto overscroll-y-contain flex-1 pb-[calc(env(safe-area-inset-bottom)+8px)]">
                {filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors text-left"
                  >
                    <span className="text-xl leading-none">{countryFlagEmoji(c.code)}</span>
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    <span className="text-sm text-fg-muted tabular-nums">{c.dialCode}</span>
                    {c.code === value.code && <Check size={16} className="text-brand shrink-0" />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-fg-muted py-8">No countries match "{query}"</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
