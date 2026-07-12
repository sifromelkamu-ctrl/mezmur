import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "mezmur:lyrics-enabled";

interface LyricsContextValue {
  lyricsEnabled: boolean;
  setLyricsEnabled: (enabled: boolean) => void;
}

const LyricsContext = createContext<LyricsContextValue | null>(null);

export function LyricsProvider({ children }: { children: ReactNode }) {
  const [lyricsEnabled, setLyricsEnabledState] = useState<boolean>(
    () => (localStorage.getItem(STORAGE_KEY) ?? "true") === "true"
  );

  const setLyricsEnabled = (enabled: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    setLyricsEnabledState(enabled);
  };

  return (
    <LyricsContext.Provider value={{ lyricsEnabled, setLyricsEnabled }}>{children}</LyricsContext.Provider>
  );
}

export function useLyricsSetting() {
  const ctx = useContext(LyricsContext);
  if (!ctx) throw new Error("useLyricsSetting must be used within LyricsProvider");
  return ctx;
}
