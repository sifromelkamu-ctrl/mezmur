import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { albumsApi, artistsApi, type ApiArtistDetail } from "../lib/api";

interface CustomArtistsContextValue {
  artists: ApiArtistDetail[];
  loading: boolean;
  refresh: () => Promise<void>;
  addArtist: (name: string) => Promise<void>;
  removeArtist: (artistId: string) => Promise<void>;
  addAlbum: (artistId: string, title: string) => Promise<void>;
  removeAlbum: (artistId: string, albumId: string) => Promise<void>;
  uploadArtistPhoto: (artistId: string, file: File) => Promise<void>;
  uploadAlbumCover: (artistId: string, albumId: string, file: File) => Promise<void>;
}

const CustomArtistsContext = createContext<CustomArtistsContextValue | null>(null);

export function CustomArtistsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [artists, setArtists] = useState<ApiArtistDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setArtists([]);
      return;
    }
    setLoading(true);
    try {
      const mine = await artistsApi.mine();
      setArtists(mine);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addArtist = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await artistsApi.create(trimmed);
      await refresh();
    },
    [refresh]
  );

  const removeArtist = useCallback(
    async (artistId: string) => {
      await artistsApi.remove(artistId);
      setArtists((prev) => prev.filter((a) => a.id !== artistId));
    },
    []
  );

  const addAlbum = useCallback(
    async (artistId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const album = await artistsApi.addAlbum(artistId, trimmed);
      setArtists((prev) =>
        prev.map((a) => (a.id === artistId ? { ...a, albums: [...a.albums, album] } : a))
      );
    },
    []
  );

  const removeAlbum = useCallback(
    async (artistId: string, albumId: string) => {
      await albumsApi.remove(albumId);
      setArtists((prev) =>
        prev.map((a) =>
          a.id === artistId ? { ...a, albums: a.albums.filter((al) => al.id !== albumId) } : a
        )
      );
    },
    []
  );

  const uploadArtistPhoto = useCallback(async (artistId: string, file: File) => {
    const updated = await artistsApi.uploadPhoto(artistId, file);
    setArtists((prev) => prev.map((a) => (a.id === artistId ? { ...a, photoUrl: updated.photoUrl } : a)));
  }, []);

  const uploadAlbumCover = useCallback(async (artistId: string, albumId: string, file: File) => {
    const updated = await albumsApi.uploadCover(albumId, file);
    setArtists((prev) =>
      prev.map((a) =>
        a.id === artistId
          ? { ...a, albums: a.albums.map((al) => (al.id === albumId ? { ...al, coverUrl: updated.coverUrl } : al)) }
          : a
      )
    );
  }, []);

  return (
    <CustomArtistsContext.Provider
      value={{
        artists,
        loading,
        refresh,
        addArtist,
        removeArtist,
        addAlbum,
        removeAlbum,
        uploadArtistPhoto,
        uploadAlbumCover,
      }}
    >
      {children}
    </CustomArtistsContext.Provider>
  );
}

export function useCustomArtists() {
  const ctx = useContext(CustomArtistsContext);
  if (!ctx) throw new Error("useCustomArtists must be used within CustomArtistsProvider");
  return ctx;
}
