import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { useAuth } from "../context/useAuth";
import { useFavorites } from "../context/FavoritesContext";
import { useLanguage } from "../context/LanguageContext";
import { usePlayer } from "../context/PlayerContext";
import { artistsApi, playlistsApi, tracksApi, type ApiArtist, type ApiPlaylist, type ApiTrack } from "../lib/api";
import { getRecentlyPlayedIds } from "../lib/recentlyPlayed";
import { buildRecommendations } from "../lib/recommendations";

export default function Recommended() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { favorites } = useFavorites();
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [ownedPlaylists, setOwnedPlaylists] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([artistsApi.list(), tracksApi.list()])
      .then(([ar, tr]) => {
        setArtists(ar);
        setTracks(tr);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) playlistsApi.mine().then(setOwnedPlaylists);
    else setOwnedPlaylists([]);
  }, [user]);

  const recommendations = useMemo(
    () =>
      buildRecommendations(
        {
          artists,
          tracks,
          favoriteTracks: favorites,
          recentlyPlayedIds: getRecentlyPlayedIds(),
          ownedPlaylists,
        },
        90
      ),
    [artists, tracks, favorites, ownedPlaylists]
  );

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-hover transition-colors -ml-1.5"
          aria-label="Back to Home"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">{t("recommendedForYou")}</h1>
      </div>

      {loading ? (
        <p className="text-fg-muted">{t("loading")}</p>
      ) : recommendations.length === 0 ? (
        <div className="text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md">
          Nothing to recommend yet — start playing and favoriting songs to build your picks.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {recommendations.map((item) => (
            <Card
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              gradient={item.gradient}
              to={item.to ?? ""}
              // A Single with no linked artist and no album has nowhere to
              // navigate to — clicking the card just plays it instead.
              onCardClick={item.to ? undefined : () => playTrack(item.track, recommendations.map((r) => r.track))}
              photoUrl={item.photoUrl}
              entityType="track"
              entityId={item.entityId}
              artworkFrame={item.artworkFrame}
              readOnlyArtwork={Boolean(item.track.albumId)}
              playing={isPlaying && currentTrack?.id === item.id}
              onPlay={() => playTrack(item.track, recommendations.map((r) => r.track))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
