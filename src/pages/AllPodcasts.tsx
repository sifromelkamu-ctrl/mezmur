import { ArrowLeft, Check, MoreVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { podcastToTrack, podcastsApi, type ApiPodcast } from "../lib/api";

type SortMode = "name" | "host";

export default function AllPodcasts() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { playTrack } = usePlayer();
  const [podcasts, setPodcasts] = useState<ApiPodcast[] | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("name");
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPodcasts(null);
    setError(false);
    podcastsApi
      .list()
      .then((data) => {
        if (!cancelled) setPodcasts(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedPodcasts = useMemo(() => {
    if (!podcasts) return [];
    const copy = [...podcasts];
    switch (sort) {
      case "name":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "host":
        return copy.sort((a, b) => a.host.localeCompare(b.host));
    }
  }, [podcasts, sort]);

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: "name", label: "Sort by Name" },
    { id: "host", label: "Sort by Host" },
  ];

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
        <h1 className="text-lg font-bold">{t("podcasts")}</h1>
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
          Couldn't load podcasts. Check your connection and try again.
        </div>
      ) : podcasts === null ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-xl bg-elevated p-4 animate-pulse">
              <div className="aspect-square rounded-md bg-elevated-hover mb-4" />
              <div className="h-3 bg-elevated-hover rounded mb-2 w-3/4" />
              <div className="h-3 bg-elevated-hover rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : sortedPodcasts.length === 0 ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">No podcasts yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {sortedPodcasts.map((podcast) => (
            <Card
              key={podcast.id}
              title={podcast.title}
              subtitle={podcast.host}
              gradient={podcast.gradient}
              to={`/podcast/${podcast.id}`}
              showSubtitle
              onPlay={() => playTrack(podcastToTrack(podcast))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
