import { ArrowLeft, Check, MoreVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { albumsApi, concertsApi, type ApiAlbum } from "../lib/api";

type SortMode = "name" | "year";

// Concert Albums are a dedicated, admin-curated category (see Settings ->
// [admin] and AlbumDetail's release-type editor) — fetched from a route
// that only ever returns concerts (server/src/routes/concerts.ts), never
// the general album catalog, so regular albums can never leak in here. This
// page is otherwise the same fetch-sort-grid shell as AllSermons/
// AllPodcasts, using the same large Card size as Albums (Library.tsx's
// albums grid) since concerts should look and behave like albums.
export default function AllConcerts() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const [concerts, setConcerts] = useState<ApiAlbum[] | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("name");
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConcerts(null);
    setError(false);
    concertsApi
      .list()
      .then((data) => {
        if (!cancelled) setConcerts(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedConcerts = useMemo(() => {
    const copy = [...(concerts ?? [])];
    switch (sort) {
      case "name":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "year":
        return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    }
  }, [concerts, sort]);

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: "name", label: "Sort by Name" },
    { id: "year", label: "Sort by Year" },
  ];

  const playAlbum = async (id: string) => {
    const full = await albumsApi.get(id);
    if (full.tracks[0]) playTrack(full.tracks[0], full.tracks);
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back to Home"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">{t("concerts")}</h1>
        <div className="relative">
          <button
            onClick={() => setShowSort((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors"
            aria-label="Sort options"
          >
            <MoreVertical size={20} />
          </button>
          {showSort && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-elevated rounded-lg shadow-2xl py-1 z-20">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSort(opt.id);
                      setShowSort(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-elevated-hover transition-colors text-left"
                  >
                    {opt.label}
                    {sort === opt.id && <Check size={14} className="text-brand" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          Couldn't load concerts. Check your connection and try again.
        </div>
      ) : concerts === null ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-xl bg-elevated p-3 animate-pulse">
              <div className="aspect-square rounded-2xl bg-elevated-hover mb-3" />
              <div className="h-3 bg-elevated-hover rounded mb-2 w-3/4 mx-auto" />
              <div className="h-3 bg-elevated-hover rounded w-1/2 mx-auto" />
            </div>
          ))}
        </div>
      ) : sortedConcerts.length === 0 ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">No concerts yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {sortedConcerts.map((album) => (
            <Card
              key={album.id}
              title={album.title}
              subtitle={album.year ? `${album.year} · Concert` : "Concert"}
              gradient={album.gradient}
              to={`/album/${album.id}`}
              photoUrl={album.coverUrl}
              large
              entityType="album"
              entityId={album.id}
              artworkFrame={album.artworkFrame}
              playing={isPlaying && currentTrack?.albumId === album.id}
              onPlay={() => playAlbum(album.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
