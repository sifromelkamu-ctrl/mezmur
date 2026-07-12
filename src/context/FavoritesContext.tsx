import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApiTrack } from "../lib/api";

const STORAGE_KEY = "mezmur:favorites";

function loadFavorites(): ApiTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiTrack[]) : [];
  } catch {
    return [];
  }
}

interface FavoritesContextValue {
  favorites: ApiTrack[];
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (track: ApiTrack) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<ApiTrack[]>(loadFavorites);

  const isFavorite = (trackId: string) => favorites.some((t) => t.id === trackId);

  const toggleFavorite = (track: ApiTrack) => {
    setFavorites((prev) => {
      const next = prev.some((t) => t.id === track.id)
        ? prev.filter((t) => t.id !== track.id)
        : [track, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
