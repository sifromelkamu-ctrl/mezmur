import {
  Check,
  Heart,
  Link2,
  MoreHorizontal,
  Music2,
  Pencil,
  Play,
  Share2,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import Card from "../components/Card";
import SectionRow from "../components/SectionRow";
import TrackRow from "../components/TrackRow";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import {
  albumsApi,
  artistsApi,
  playlistsApi,
  type ApiAlbum,
  type ApiAlbumType,
  type ApiArtistDetail,
  type ApiPlaylist,
} from "../lib/api";
import { renderWithAmharicStyle } from "../utils/scriptText";

const ALBUM_TYPE_ORDER: ApiAlbumType[] = ["album", "ep", "single", "live", "compilation"];
const ALBUM_TYPE_SECTION_LABEL: Record<ApiAlbumType, string> = {
  album: "Albums",
  ep: "EPs",
  single: "Singles",
  live: "Concert Albums",
  compilation: "Compilations",
};
const ALBUM_TYPE_LABEL: Record<ApiAlbumType, string> = {
  album: "Album",
  ep: "EP",
  single: "Single",
  live: "Concert Album",
  compilation: "Compilation",
};

function albumSubtitle(album: ApiAlbum): string {
  const parts: string[] = [];
  if (album.year) parts.push(String(album.year));
  const count = album.trackCount ?? 0;
  parts.push(`${count} track${count === 1 ? "" : "s"}`);
  parts.push(ALBUM_TYPE_LABEL[album.albumType]);
  return parts.join(" · ");
}

export default function ArtistDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currentTrack, isPlaying, playTrack, shuffle, toggleShuffle } = usePlayer();
  const [artist, setArtist] = useState<ApiArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", bio: "" });
  const [saving, setSaving] = useState(false);
  const [heroPhotoLoaded, setHeroPhotoLoaded] = useState(false);
  const [heroPhotoFailed, setHeroPhotoFailed] = useState(false);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setArtist(null);
    setFollowing(false);
    setShowMenu(false);
    setEditing(false);
    setHeroPhotoLoaded(false);
    setHeroPhotoFailed(false);
    setShowAllSongs(false);
    artistsApi
      .get(id)
      .then(setArtist)
      .catch(() => setArtist(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Playlists here aren't specific to this artist (the catalog has no such
  // relationship) — shown as a general "you might also like" row, same
  // source Home/Library already use, just to round out the page the way the
  // reference design does.
  useEffect(() => {
    playlistsApi.list().then(setPlaylists);
  }, []);

  const albumsByType = useMemo(() => {
    const grouped: Record<ApiAlbumType, ApiAlbum[]> = { album: [], ep: [], single: [], live: [], compilation: [] };
    for (const album of artist?.albums ?? []) grouped[album.albumType].push(album);
    return grouped;
  }, [artist]);

  if (loading) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Loading...
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="relative px-6 py-10 text-fg-muted">
        <BackButton />
        Artist not found.
      </div>
    );
  }

  const handlePlayAlbum = async (albumId: string) => {
    const album = await albumsApi.get(albumId);
    if (album.tracks[0]) playTrack(album.tracks[0], album.tracks);
  };

  const artistUrl = `${window.location.origin}${window.location.pathname}#/artist/${artist.id}`;

  const flashCopied = () => {
    setCopied(true);
    if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
    copiedTimeout.current = setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: artist.name, url: artistUrl });
        return;
      } catch {
        // user cancelled or share failed, fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(artistUrl);
    flashCopied();
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(artistUrl);
    setShowMenu(false);
    flashCopied();
  };

  const handlePlayAll = () => {
    if (artist.topTracks[0]) playTrack(artist.topTracks[0], artist.topTracks);
  };

  const handleShuffle = () => {
    if (artist.topTracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = artist.topTracks[Math.floor(Math.random() * artist.topTracks.length)];
    playTrack(randomTrack, artist.topTracks);
  };

  const handleArtistRadio = () => {
    setShowMenu(false);
    handleShuffle();
  };

  const startEditing = () => {
    setForm({ name: artist.name, bio: artist.bio ?? "" });
    setEditing(true);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const updated = await artistsApi.update(artist.id, {
        name: form.name.trim() || artist.name,
        bio: form.bio.trim(),
      });
      setArtist({ ...artist, ...updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    const updated = await artistsApi.uploadPhoto(artist.id, file);
    setArtist({ ...artist, photoUrl: updated.photoUrl });
  };

  const handlePhotoRemove = async () => {
    const updated = await artistsApi.removePhoto(artist.id);
    setArtist({ ...artist, photoUrl: updated.photoUrl });
  };

  const showHeroPhoto = Boolean(artist.photoUrl) && !heroPhotoFailed;
  const visibleTopTracks = showAllSongs ? artist.topTracks : artist.topTracks.slice(0, 5);

  return (
    <div>
      <div className="relative w-full overflow-hidden" style={{ height: "min(62vh, 520px)" }}>
        <div className="absolute inset-0">
          {showHeroPhoto ? (
            <img
              src={artist.photoUrl}
              alt=""
              className={`w-full h-full object-cover transition-opacity duration-300 ${heroPhotoLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setHeroPhotoLoaded(true)}
              onError={() => setHeroPhotoFailed(true)}
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ backgroundImage: `linear-gradient(150deg, ${artist.gradient[0]}, ${artist.gradient[1]})` }}
            />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/55 to-black/10" />

        <BackButton />
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setShowMenu((m) => !m)}
            className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={20} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 bg-elevated rounded-md shadow-2xl py-1 z-20">
                <button
                  onClick={handleArtistRadio}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                >
                  <Shuffle size={14} />
                  Play artist radio
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                >
                  <Link2 size={14} />
                  Copy link to artist
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        startEditing();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                    >
                      <Pencil size={14} />
                      Edit name & bio
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        photoInputRef.current?.click();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                    >
                      <Upload size={14} />
                      Upload or replace photo
                    </button>
                    {artist.photoUrl && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          handlePhotoRemove();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-elevated-hover transition-colors text-left"
                      >
                        <Trash2 size={14} />
                        Remove photo
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
          />
        </div>

        <div className="absolute bottom-0 inset-x-0 p-6">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0">
              <Check size={10} className="text-black" strokeWidth={3} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-brand">Artist</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight break-words">{renderWithAmharicStyle(artist.name)}</h1>
          <p className="text-sm text-fg-muted mt-1">{artist.monthlyListeners.toLocaleString()} monthly listeners</p>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 bg-brand text-black font-bold rounded-full pl-5 pr-6 py-3 shadow-lg shadow-brand/30 hover:scale-105 transition-transform"
            aria-label="Play"
          >
            <Play size={18} fill="black" />
            Play
          </button>
          <button
            onClick={handleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              shuffle ? "bg-hover text-brand" : "bg-elevated text-fg-muted hover:text-fg"
            }`}
            aria-label="Shuffle"
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={() => setFollowing((f) => !f)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              following ? "bg-hover text-brand" : "bg-elevated text-fg-muted hover:text-fg"
            }`}
            aria-label={following ? "Unfollow artist" : "Follow artist"}
          >
            <Heart size={17} fill={following ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleShare}
            className="w-11 h-11 rounded-full bg-elevated flex items-center justify-center text-fg-muted hover:text-fg transition-colors"
            aria-label="Share artist"
          >
            {copied ? <Check size={18} className="text-brand" /> : <Share2 size={18} />}
          </button>
        </div>

        {editing ? (
          <div className="text-left space-y-3 bg-elevated rounded-xl p-4 mb-8">
            <div>
              <label className="text-xs text-fg-muted block mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
              />
            </div>
            <div>
              <label className="text-xs text-fg-muted block mb-1">Biography</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                rows={4}
                placeholder="Optional artist biography"
                className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveEdits}
                disabled={saving}
                className="flex items-center gap-1.5 bg-brand text-black text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
              >
                <Check size={14} />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg px-3 py-1.5"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          artist.bio && <p className="text-fg-muted text-sm max-w-2xl mb-8">{artist.bio}</p>
        )}

        {artist.albums.length === 0 && (
          <div className="flex items-center gap-3 text-fg-muted text-sm bg-elevated/50 rounded-lg p-4 max-w-md mb-10">
            <Music2 size={18} />
            No albums yet — check back soon.
          </div>
        )}

        {ALBUM_TYPE_ORDER.filter((type) => albumsByType[type].length > 0).map((type) => (
          <SectionRow key={type} title={ALBUM_TYPE_SECTION_LABEL[type]} accent="gold" large scroll>
            {albumsByType[type].map((album) => (
              <Card
                key={album.id}
                title={album.title}
                subtitle={albumSubtitle(album)}
                gradient={album.gradient}
                to={type === "live" ? `/concert/${album.id}` : `/album/${album.id}`}
                photoUrl={album.coverUrl}
                large
                entityType="album"
                entityId={album.id}
                artworkFrame={album.artworkFrame}
                playing={isPlaying && currentTrack?.albumId === album.id}
                onPlay={() => handlePlayAlbum(album.id)}
              />
            ))}
          </SectionRow>
        ))}

        {artist.topTracks.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
                <h2 className="text-xl font-bold tracking-tight">Popular Songs</h2>
              </div>
              {artist.topTracks.length > 5 && (
                <button
                  onClick={() => setShowAllSongs((s) => !s)}
                  className="text-sm font-semibold text-brand hover:text-brand-glow transition-colors"
                >
                  {showAllSongs ? "Show less" : "View all"}
                </button>
              )}
            </div>
            {visibleTopTracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i + 1} queue={visibleTopTracks} showArtistName={false} showPlayCount />
            ))}
          </section>
        )}

        {playlists.length > 0 && (
          <SectionRow title="Playlists" accent="violet" large scroll>
            {playlists.map((pl) => (
              <Card
                key={pl.id}
                title={pl.title}
                subtitle={pl.description || "Playlist"}
                gradient={pl.gradient}
                to={`/playlist/${pl.id}`}
                photoUrl={pl.coverUrl}
                large
                entityType="playlist"
                entityId={pl.id}
                artworkFrame={pl.artworkFrame}
              />
            ))}
          </SectionRow>
        )}
      </div>
    </div>
  );
}
