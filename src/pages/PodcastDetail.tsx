import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import { usePlayer } from "../context/PlayerContext";
import { podcastsApi, podcastToTrack, type ApiPodcast } from "../lib/api";
import { cachedDetailFetch } from "../lib/detailCache";
import { formatDuration } from "../utils/format";

export default function PodcastDetail() {
  const { id } = useParams();
  const { playTrack } = usePlayer();
  const [podcast, setPodcast] = useState<ApiPodcast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    cachedDetailFetch(`podcast:${id}`, () => podcastsApi.get(id))
      .then(setPodcast)
      .catch(() => setPodcast(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Podcast not found.
      </div>
    );
  }

  return (
    <div>
      <div
        className="relative flex flex-col items-center text-center gap-4 px-6 pb-6"
        style={{
          backgroundImage: `linear-gradient(180deg, ${podcast.gradient[0]}66, ${podcast.gradient[1]}22)`,
          marginTop: "calc(-1 * env(safe-area-inset-top))",
          paddingTop: "calc(env(safe-area-inset-top) + 2.5rem)",
        }}
      >
        <BackButton variant="glass" />
        <CoverArt gradient={podcast.gradient} size="xl" />
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide">Podcast</p>
          <h1 className="text-3xl font-black tracking-tight mt-2 mb-4 break-words">
            {podcast.title}
          </h1>
          <p className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">{podcast.host}</span> · {formatDuration(podcast.duration)}
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <button
          onClick={() => playTrack(podcastToTrack(podcast))}
          className="w-14 h-14 rounded-full bg-brand text-black flex items-center justify-center shadow-lg shadow-brand/30 hover:scale-110 hover:shadow-brand/50 transition-all mb-6"
          aria-label="Play podcast"
        >
          <Play size={24} fill="black" className="ml-1" />
        </button>

        {podcast.description && <p className="text-fg-muted text-sm max-w-2xl">{podcast.description}</p>}
      </div>
    </div>
  );
}
