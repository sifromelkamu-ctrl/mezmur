import {
  Check,
  Heart,
  Link2,
  MoreHorizontal,
  Music2,
  Pause,
  Pencil,
  Play,
  Share2,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import EqualizerBars from "../components/EqualizerBars";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { useTheme } from "../context/ThemeContext";
import { albumsApi, artistsApi, type ApiAlbum, type ApiAlbumType, type ApiArtistDetail, type ApiTrack } from "../lib/api";
import { formatDuration } from "../utils/format";

// The hero stays this one fixed teal gradient regardless of the app's
// light/dark toggle (explicitly kept "exactly as it is" per the split-theme
// redesign) — only the content surface below it now follows the real theme.
const TEAL = "#14b8a6";
const TEAL_DEEP = "#134e4a";

// The bright content surface's own palette — split by the real light/dark
// mode, unlike the hero above. Values as specified: white/#121212 surface,
// #ECECEC/#1A1A1A cards, #111111/#6B7280/#9CA3AF text in light mode (dark
// mode isn't specified, so those three mirror the app's own existing
// dark-theme text tones for sensible contrast against the #1A1A1A cards).
const SURFACE = { light: "#ffffff", dark: "#121212" };
const CARD_BG = { light: "#ffffff", dark: "#1A1A1A" };
const CARD_BORDER = { light: "#ECECEC", dark: "rgba(255,255,255,0.08)" };
const SONG_CARD_BORDER = { light: "#F2F2F2", dark: "rgba(255,255,255,0.06)" };
const TEXT_TITLE = { light: "#111111", dark: "#ffffff" };
const TEXT_SUBTLE = { light: "#6B7280", dark: "#9ba6b5" };
const TEXT_FAINT = { light: "#9CA3AF", dark: "#6b7482" };

// "live" (Concert Albums) is deliberately excluded — concerts are a
// completely separate content type and must never appear in an artist's
// own discography (see Home's dedicated Concerts section / /concert/:id
// instead).
const ALBUM_TYPE_ORDER: ApiAlbumType[] = ["album", "ep", "single", "compilation"];
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

// Purpose-built for this carousel's exact spec (2-line title, 1-line
// metadata, 160px square art — sized so ~2 cards fill the viewport, with
// just a sliver of a third peeking in to signal it scrolls) rather than the
// shared Card component, whose non-portrait variant does the opposite
// (1-line title, 2-line subtitle). Same shadow/hover-scale/play-button
// language as Card, snap-x child. Wrapped in its own light/dark card surface
// per the split-theme redesign (white+#ECECEC border / #1A1A1A card).
function AlbumCard({
  album,
  to,
  playing,
  onPlay,
  isLight,
}: {
  album: ApiAlbum;
  to: string;
  playing: boolean;
  onPlay: () => void;
  isLight: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(to)}
      className="snap-start shrink-0 w-40 group cursor-pointer active:scale-[0.97] transition-transform duration-150 rounded-[20px] p-2.5"
      style={{
        backgroundColor: isLight ? CARD_BG.light : CARD_BG.dark,
        border: `1px solid ${isLight ? CARD_BORDER.light : CARD_BORDER.dark}`,
        boxShadow: isLight ? "0 4px 14px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <div className="relative rounded-xl overflow-hidden shadow-lg shadow-black/40">
        <CoverArt
          gradient={album.gradient}
          size="md"
          photoUrl={album.coverUrl}
          entityType="album"
          entityId={album.id}
          artworkFrame={album.artworkFrame}
          className={`w-full aspect-square transition-transform duration-300 group-hover:scale-105 ${
            playing ? "ring-2 ring-[#14b8a6] shadow-[0_0_14px_rgba(20,184,166,0.55)]" : ""
          }`}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-black opacity-0 group-hover:opacity-100 active:scale-90 transition-all shadow-lg"
          style={{ backgroundColor: TEAL }}
          aria-label={`Play ${album.title}`}
        >
          <Play size={14} fill="black" className="ml-0.5" />
        </button>
      </div>
      <div className="mt-2 px-0.5">
        <p
          className="text-sm font-semibold leading-snug line-clamp-2"
          style={{ color: isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}
        >
          {album.title}
        </p>
        <p className="text-xs truncate mt-1" style={{ color: isLight ? TEXT_SUBTLE.light : TEXT_SUBTLE.dark }}>
          {albumSubtitle(album)}
        </p>
      </div>
    </div>
  );
}

// Bespoke Popular Songs row for the split-theme content surface — the
// shared TrackRow reads the app's generic text-fg/text-fg-muted tokens,
// which don't match this section's exact spec'd hex values (#111111 title /
// #6B7280 artist / #9CA3AF duration in light mode), so this mirrors
// TrackRow's play/pause/queue behavior with its own themed markup instead.
function SongRow({
  track,
  index,
  queue,
  isLight,
}: {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
  isLight: boolean;
}) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();
  const isCurrent = currentTrack?.id === track.id;

  const handleClick = () => {
    if (isCurrent) togglePlay();
    else playTrack(track, queue);
  };

  return (
    <div
      onClick={handleClick}
      className="group grid grid-cols-[24px_1fr_auto] items-center gap-4 px-4 rounded-2xl cursor-pointer transition-colors mb-3 last:mb-0"
      style={{
        backgroundColor: isLight ? CARD_BG.light : "#1A1A1A",
        border: `1px solid ${isLight ? SONG_CARD_BORDER.light : SONG_CARD_BORDER.dark}`,
        boxShadow: isLight ? "0 2px 10px rgba(0,0,0,0.05)" : "none",
        paddingBlock: "10px",
      }}
    >
      <div className="flex items-center justify-center text-sm w-6" style={{ color: TEXT_FAINT[isLight ? "light" : "dark"] }}>
        <span className="group-hover:hidden">{isCurrent && isPlaying ? <EqualizerBars /> : index}</span>
        <span className="hidden group-hover:flex">
          {isCurrent && isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
        </span>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <CoverArt
          gradient={track.gradient}
          size="sm"
          photoUrl={track.coverUrl}
          entityType="track"
          entityId={track.id}
          artworkFrame={track.artworkFrame}
        />
        <p
          className="text-sm font-medium truncate"
          style={{ color: isCurrent ? TEAL : isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}
        >
          {track.title}
        </p>
      </div>

      <span
        className="text-sm tabular-nums text-right"
        style={{ color: isLight ? TEXT_FAINT.light : TEXT_FAINT.dark }}
      >
        {formatDuration(track.duration)}
      </span>
    </div>
  );
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
  const [showAllSongs, setShowAllSongs] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin";
  const { mode } = useTheme();
  const isLight = mode === "light";

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

  const albumsByType = useMemo(() => {
    const grouped: Record<ApiAlbumType, ApiAlbum[]> = { album: [], ep: [], single: [], live: [], compilation: [] };
    for (const album of artist?.albums ?? []) grouped[album.albumType].push(album);
    return grouped;
  }, [artist]);

  // Stats card figures — derived from data already fetched (each album
  // already carries its own trackCount).
  const totalSongCount = useMemo(
    () => (artist?.albums ?? []).reduce((sum, a) => sum + (a.trackCount ?? 0), 0),
    [artist]
  );

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
    // Flat, not a gradient — the teal→black transition now lives entirely
    // on the hero below, scoped to its own fixed height (see comment
    // there). Keeping a second, page-length-based gradient here was the
    // bug: its color stops are percentages of the *whole page*, so on a
    // shorter page (short bio, few albums) the hero's fixed-height bottom
    // edge landed mid-transition — still greenish, not yet black — right
    // where the photo's own overlay above it was already solid black,
    // producing a visible hard seam. A flat fill always matches exactly.
    <div style={{ backgroundColor: "#050707" }}>
      <div className="relative w-full overflow-hidden" style={{ height: "min(46vh, 380px)" }}>
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
        {/* Teal→black wash — stays fully transparent for the top half of the
            photo (previous version started darkening at 18% and stacked a
            second black overlay on top, washing out most of the picture)
            and only darkens the bottom third, still fully resolving to
            solid #050707 by its own bottom edge so it stays flush with the
            flat page background right below it regardless of page length. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 48%, ${TEAL_DEEP}4d 62%, #0d2f2c99 75%, #0a1614dd 90%, #050707 100%)`,
          }}
        />

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
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 mb-3 backdrop-blur-sm"
            style={{ borderColor: `${TEAL}80`, backgroundColor: `${TEAL_DEEP}66` }}
          >
            <Check size={12} style={{ color: TEAL }} strokeWidth={3} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: TEAL }}>
              Artist
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight break-words text-white">{artist.name}</h1>
          <p className="text-sm text-white/70 mt-1">{artist.monthlyListeners.toLocaleString()} monthly listeners</p>
        </div>
      </div>

      <div className="px-6 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 text-black font-bold rounded-full pl-5 pr-6 py-3 shadow-lg hover:scale-105 transition-transform"
            style={{ backgroundColor: TEAL, boxShadow: `0 10px 30px -8px ${TEAL}66` }}
            aria-label="Play"
          >
            <Play size={18} fill="black" />
            Play
          </button>
          <button
            onClick={handleShuffle}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/15"
            style={{ color: shuffle ? TEAL : "rgba(255,255,255,0.75)" }}
            aria-label="Shuffle"
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={() => setFollowing((f) => !f)}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/15"
            style={{ color: following ? TEAL : "rgba(255,255,255,0.75)" }}
            aria-label={following ? "Unfollow artist" : "Follow artist"}
          >
            <Heart size={17} fill={following ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleShare}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/75 transition-colors"
            aria-label="Share artist"
          >
            {copied ? <Check size={18} style={{ color: TEAL }} /> : <Share2 size={18} />}
          </button>
        </div>
      </div>

      {/* Bright content surface — everything from here down follows the
          app's real light/dark theme (unlike the hero above, which stays
          this one fixed teal gradient always). The negative top margin
          exactly cancels the action row's own mb-6 above, so the rounded
          top corners sit flush against the buttons with no dead gap, while
          the gradient still shows through the rounded corners themselves
          (it extends behind this whole container). */}
      <div
        className="relative rounded-t-[32px] px-5 sm:px-6 pt-6 pb-10"
        style={{
          marginTop: "-24px",
          backgroundColor: isLight ? SURFACE.light : SURFACE.dark,
          boxShadow: "0 -12px 32px rgba(0,0,0,0.28)",
        }}
      >
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
          artist.bio && (
            <p className="text-sm max-w-2xl mb-6" style={{ color: isLight ? TEXT_SUBTLE.light : TEXT_SUBTLE.dark }}>
              {artist.bio}
            </p>
          )
        )}

        <div
          className="grid grid-cols-2 gap-3 rounded-2xl p-4 mb-8"
          style={{
            backgroundColor: isLight ? CARD_BG.light : CARD_BG.dark,
            border: `1px solid ${isLight ? CARD_BORDER.light : CARD_BORDER.dark}`,
            boxShadow: isLight ? "0 4px 14px rgba(0,0,0,0.05)" : "none",
          }}
        >
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-1.5">
              <Music2 size={15} style={{ color: TEAL }} />
              <span className="text-lg font-bold" style={{ color: isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}>
                {artist.albums.length}
              </span>
            </div>
            <span className="text-xs" style={{ color: isLight ? TEXT_SUBTLE.light : TEXT_SUBTLE.dark }}>
              Albums
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="flex items-center gap-1.5">
              <Music2 size={15} style={{ color: TEAL }} />
              <span className="text-lg font-bold" style={{ color: isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}>
                {totalSongCount}
              </span>
            </div>
            <span className="text-xs" style={{ color: isLight ? TEXT_SUBTLE.light : TEXT_SUBTLE.dark }}>
              Songs
            </span>
          </div>
        </div>

        {artist.albums.length === 0 && (
          <div
            className="flex items-center gap-3 text-sm rounded-lg p-4 max-w-md mb-10"
            style={{
              color: isLight ? TEXT_SUBTLE.light : TEXT_SUBTLE.dark,
              backgroundColor: isLight ? CARD_BG.light : CARD_BG.dark,
              border: `1px solid ${isLight ? CARD_BORDER.light : CARD_BORDER.dark}`,
            }}
          >
            <Music2 size={18} />
            No albums yet — check back soon.
          </div>
        )}

        {ALBUM_TYPE_ORDER.filter((type) => albumsByType[type].length > 0).map((type) => (
          <section key={type} className="mb-8">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-1 h-5 rounded-full" style={{ backgroundColor: TEAL }} />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}>
                {ALBUM_TYPE_SECTION_LABEL[type]}
              </h2>
            </div>
            {/* Breaks out of the surface's own px-5/6 to a smaller, 16px
                edge inset of its own — negative margin cancels the parent's
                padding (bleeding the scrollable hit-area to the true
                viewport edge), +16px brings the visible cards back in from
                there. */}
            <div
              className="flex overflow-x-auto overscroll-x-contain no-scrollbar snap-x snap-mandatory scroll-smooth gap-4 pb-1"
              style={{ marginInline: "-20px", paddingInline: "16px", scrollPaddingInline: "16px" }}
            >
              {albumsByType[type].map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  to={`/album/${album.id}`}
                  playing={isPlaying && currentTrack?.albumId === album.id}
                  onPlay={() => handlePlayAlbum(album.id)}
                  isLight={isLight}
                />
              ))}
            </div>
          </section>
        ))}

        {artist.topTracks.length > 0 && (
          <section className="mb-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
                <h2 className="text-xl font-bold tracking-tight" style={{ color: isLight ? TEXT_TITLE.light : TEXT_TITLE.dark }}>
                  Popular Songs
                </h2>
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
              <SongRow key={track.id} track={track} index={i + 1} queue={visibleTopTracks} isLight={isLight} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
