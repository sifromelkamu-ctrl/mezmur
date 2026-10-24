import {
  Check,
  Disc3,
  Heart,
  Link2,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import defaultAlbumArt from "../assets/default-album-art.jpg";
import BackButton from "../components/BackButton";
import CoverArt from "../components/CoverArt";
import EqualizerBars from "../components/EqualizerBars";
import HeroTopScrim from "../components/HeroTopScrim";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import { useTheme } from "../context/ThemeContext";
import {
  adminApi,
  albumsApi,
  artistsApi,
  type ApiAlbum,
  type ApiAlbumType,
  type ApiArtistDetail,
  type ApiTrack,
} from "../lib/api";
import { cachedDetailFetch } from "../lib/detailCache";
import { formatDuration } from "../utils/format";
import { hasEthiopicScript } from "../utils/scriptText";

// The hero stays this one fixed teal gradient regardless of the app's
// light/dark toggle (explicitly kept "exactly as it is" per the split-theme
// redesign) — only the content surface below it now follows the real theme.
const TEAL = "#14b8a6";
const TEAL_DEEP = "#134e4a";

// The content surface below the hero used to carry its own bespoke
// white/#121212 palette here, independent of the app's real theme (a past
// "split-theme redesign"). That made this page read jarringly bright
// compared to everywhere else — the app's actual light theme is a warm
// cream (see index.css's --color-elevated etc.), never stark white. Now
// uses the same shared bg-elevated/bg-panel/text-fg/border-border tokens as
// every other page, so this section matches Home and the rest of the app
// exactly, in both light and dark mode.

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
      className="snap-start shrink-0 w-40 group cursor-pointer active:scale-[0.97] transition-transform duration-100 rounded-[20px] p-2.5 bg-elevated border border-border"
      style={{ boxShadow: isLight ? "0 4px 14px rgba(0,0,0,0.06)" : "none" }}
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
        <p className="text-sm font-semibold leading-snug line-clamp-2 text-fg">{album.title}</p>
        <p className="text-xs truncate mt-1 text-fg-muted">{albumSubtitle(album)}</p>
      </div>
    </div>
  );
}

// Bespoke Single Releases row for the split-theme content surface — the
// shared TrackRow reads the app's generic text-fg/text-fg-muted tokens,
// which don't match this section's exact spec'd hex values (#111111 title /
// #6B7280 artist / #9CA3AF duration in light mode), so this mirrors
// TrackRow's play/pause/queue behavior with its own themed markup instead.
function SongRow({
  track,
  index,
  queue,
}: {
  track: ApiTrack;
  index: number;
  queue: ApiTrack[];
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
      className="group grid grid-cols-[24px_1fr_auto] items-center gap-4 px-4 rounded-2xl cursor-pointer transition-colors mb-3 last:mb-0 bg-panel border border-border"
      style={{ paddingBlock: "10px" }}
    >
      <div className="flex items-center justify-center text-sm w-6 text-fg-subtle">
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
          className={`text-sm font-medium truncate ${isCurrent ? "" : "text-fg"}`}
          style={isCurrent ? { color: TEAL } : undefined}
        >
          {track.title}
        </p>
      </div>

      <span className="text-sm tabular-nums text-right text-fg-subtle">{formatDuration(track.duration)}</span>
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
  const [addingAlbum, setAddingAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [newAlbumType, setNewAlbumType] = useState<ApiAlbumType>("album");
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [addAlbumError, setAddAlbumError] = useState<string | null>(null);
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
    cachedDetailFetch(`artist:${id}`, () => artistsApi.get(id))
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
    const album = await cachedDetailFetch(`album:${albumId}`, () => albumsApi.get(albumId));
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

  // Single Releases when the artist has any; their most-played tracks
  // otherwise (server only bothers computing that fallback list when
  // singleReleases is empty — see GET /api/artists/:id), so this section
  // never just goes blank for an artist with no standalone singles yet.
  const songsSectionTracks = artist.singleReleases.length > 0 ? artist.singleReleases : artist.topTracks;
  const songsSectionTitle = artist.singleReleases.length > 0 ? "Single Releases" : "Popular Songs";

  const handlePlayAll = () => {
    if (songsSectionTracks[0]) playTrack(songsSectionTracks[0], songsSectionTracks);
  };

  const handleShuffle = () => {
    if (songsSectionTracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const randomTrack = songsSectionTracks[Math.floor(Math.random() * songsSectionTracks.length)];
    playTrack(randomTrack, songsSectionTracks);
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

  const handleCreateAlbum = async () => {
    const title = newAlbumTitle.trim();
    if (!title) return;
    setCreatingAlbum(true);
    setAddAlbumError(null);
    try {
      const album = await adminApi.addAlbum(artist.id, title, newAlbumType);
      setArtist({ ...artist, albums: [...artist.albums, album] });
      setNewAlbumTitle("");
      setNewAlbumType("album");
      setAddingAlbum(false);
    } catch (err) {
      setAddAlbumError(err instanceof Error ? err.message : "Could not create album");
    } finally {
      setCreatingAlbum(false);
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
  const visibleSongs = showAllSongs ? songsSectionTracks : songsSectionTracks.slice(0, 5);

  return (
    // Flat, not a gradient — the wash→solid transition now lives entirely
    // on the hero below, scoped to its own fixed height (see comment
    // there). Keeping a second, page-length-based gradient here was the
    // bug: its color stops are percentages of the *whole page*, so on a
    // shorter page (short bio, few albums) the hero's fixed-height bottom
    // edge landed mid-transition, producing a visible hard seam. A flat
    // fill always matches exactly. "Light black" (a soft charcoal, not
    // pure black) now — must stay in sync with the hero wash's own final
    // stop below.
    <div
      style={{
        backgroundColor: "#2e2e2e",
        marginTop: "calc(-1 * env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
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
            // Same branded fallback cover as CoverArt/Card use for other
            // artists/albums with no artwork — this hero renders its own
            // artwork directly rather than through CoverArt, so it's kept
            // in sync here instead.
            <img src={defaultAlbumArt} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        {/* "Light black" wash now, and back to a smooth, continuous
            decrease spanning most of the hero (transparent at the top,
            solid by the bottom) instead of the last several passes' tiny
            ~15% band — starts increasing at 35%, ramps smoothly the rest
            of the way down, no abrupt jump. TEAL/TEAL_DEEP themselves are
            untouched — this wash is the only thing switching color, not
            the badge/Play button/other teal accents elsewhere on this
            page. The very last stop stays fully opaque #2e2e2e — it must
            match the flat page wrapper's own background exactly, same
            reasoning as always. Since the backdrop is dark again (not
            light gray/blue anymore), the Shuffle/Follow/Share buttons
            switch back to white-on-dark styling — dark icons would
            disappear against this. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 35%, #2e2e2e14 55%, #2e2e2e59 78%, #2e2e2e 100%)`,
          }}
        />

        <HeroTopScrim />
        <BackButton variant="glass" topOffsetRem={0} />
        {/* Same reasoning as BackButton's "glass" variant: this floats near
            the true top of the screen inside a hero whose negative margin
            cancels the page's ambient safe-area padding, so it needs its
            own explicit inset to clear the system UI touch zone up there
            (status bar on Android, Dynamic Island on newer iPhones) — 0
            here still means flush with the *bottom* of that zone, not
            inside it, since it's added on top of env(safe-area-inset-top)
            rather than replacing it. Kept in sync with BackButton's own
            topOffsetRem={0} above so the two stay aligned. */}
        <div className="absolute top-[env(safe-area-inset-top)] right-4">
          <button
            onClick={() => setShowMenu((m) => !m)}
            className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-xl ring-1 ring-white/15 shadow-lg flex items-center justify-center text-white hover:bg-white/20 transition-colors"
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
          {/* font-eb-garamond — switched from font-playfair (Playfair
              Display's heavy, high-contrast editorial look wasn't it) to
              EB Garamond, a classic, refined serif with a softer,
              old-style character — already loaded and wired as one of the
              app's Bible-reading font options, reused here rather than
              introducing a new font. Gated on script, same reasoning as
              before: EB Garamond has no Ethiopic glyphs, so an Amharic
              name keeps the default sans instead of silently falling
              through to the browser's generic serif. font-bold, not
              font-black, for the Latin case — the EB Garamond weights
              actually loaded (index.html) only go up to 700; asking for
              900 would just make the browser synthetically (fake-)bold
              the 700 weight instead of rendering a real one. Amharic names
              keep font-black — that's the default sans's own real 900. */}
          <h1
            className={`text-4xl tracking-tight break-words text-white ${
              hasEthiopicScript(artist.name) ? "font-black" : "font-eb-garamond font-bold"
            }`}
          >
            {artist.name}
          </h1>
          <p className="text-sm text-white/70 mt-1">{artist.monthlyListeners.toLocaleString()} monthly listeners</p>
        </div>
      </div>

      {/* pt-2/mb-2 instead of pt-6/mb-6 — this block sits on the page
          wrapper's own solid black background (the hero wash's own final
          stop), so trimming its padding directly shrinks how much plain
          black shows between the hero and the content surface below. */}
      <div className="px-6 pt-2">
        <div className="flex items-center gap-3 mb-2">
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
          this one fixed teal gradient always). A small positive gap instead
          of the previous negative margin, which made the rounded top
          corners sit flush against the action row right above with no
          breathing room at all. */}
      <div
        className="relative rounded-t-[32px] px-5 sm:px-6 pt-6 pb-10 bg-panel"
        style={{ marginTop: "6px", boxShadow: "0 -12px 32px rgba(0,0,0,0.28)" }}
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
            <p className="text-sm max-w-2xl mb-6 text-fg-muted">{artist.bio}</p>
          )
        )}

        {/* Dark glass card, not a theme-following flat panel — this is a
            dedicated look (square colored icon badges, a real
            number/label/subtitle hierarchy per stat, a blurred peek of the
            artist's own photo on the right) rather than reusing bg-elevated,
            so it reads as a distinct floating element the way a photo-app
            stat card does. */}
        <div className="relative rounded-2xl mb-8 overflow-hidden backdrop-blur-xl bg-black/30 ring-1 ring-white/10 shadow-lg">
          {artist.photoUrl && (
            <img
              src={artist.photoUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-y-0 right-0 w-28 object-cover opacity-25"
              style={{ filter: "blur(6px)", maskImage: "linear-gradient(to left, black, transparent)" }}
            />
          )}
          <div className="relative grid grid-cols-2 divide-x divide-white/10">
            <div className="flex items-center gap-3 px-5 py-4">
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: TEAL }}
              >
                <Disc3 size={20} className="text-black" />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-white leading-tight">{artist.albums.length}</p>
                <p className="text-xs font-semibold text-white/90">Albums</p>
                <p className="text-[11px] text-white/55">Complete albums</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-blue-500">
                <ListMusic size={20} className="text-white" />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-white leading-tight">{totalSongCount}</p>
                <p className="text-xs font-semibold text-white/90">Songs</p>
                <p className="text-[11px] text-white/55">Total tracks</p>
              </div>
            </div>
          </div>
        </div>

        {isAdmin &&
          (addingAlbum ? (
            <div className="text-left space-y-3 bg-elevated rounded-xl p-4 mb-8">
              <div>
                <label className="text-xs text-fg-muted block mb-1">Album title</label>
                <input
                  value={newAlbumTitle}
                  onChange={(e) => setNewAlbumTitle(e.target.value)}
                  placeholder="e.g. Live in Addis"
                  autoFocus
                  className="w-full bg-base rounded-md px-3 py-2 text-sm placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-border"
                />
              </div>
              <div>
                <label className="text-xs text-fg-muted block mb-1">Type</label>
                <div className="flex flex-wrap gap-2">
                  {ALBUM_TYPE_ORDER.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewAlbumType(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        newAlbumType === type
                          ? "bg-brand text-black border-transparent"
                          : "border-border text-fg-muted hover:text-fg hover:border-fg-subtle"
                      }`}
                    >
                      {ALBUM_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </div>
              {addAlbumError && <p className="text-xs text-accent-red">{addAlbumError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateAlbum}
                  disabled={creatingAlbum || !newAlbumTitle.trim()}
                  className="flex items-center gap-1.5 bg-brand text-black text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
                >
                  <Check size={14} />
                  {creatingAlbum ? "Creating…" : "Create album"}
                </button>
                <button
                  onClick={() => {
                    setAddingAlbum(false);
                    setAddAlbumError(null);
                    setNewAlbumTitle("");
                  }}
                  className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg px-3 py-1.5"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingAlbum(true)}
              className="flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2.5 mb-8 text-fg-muted hover:text-fg bg-elevated hover:bg-elevated-hover border border-border transition-colors"
            >
              <Plus size={15} />
              Add album
            </button>
          ))}

        {artist.albums.length === 0 && !addingAlbum && (
          <div className="flex items-center gap-3 text-sm rounded-lg p-4 max-w-md mb-10 text-fg-muted bg-elevated border border-border">
            <Music2 size={18} />
            No albums yet{isAdmin ? " — add one above." : " — check back soon."}
          </div>
        )}

        {ALBUM_TYPE_ORDER.filter((type) => albumsByType[type].length > 0).map((type) => (
          <section key={type} className="mb-8">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-1 h-5 rounded-full" style={{ backgroundColor: TEAL }} />
              <h2 className="text-xl font-bold tracking-tight text-fg">
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

        {songsSectionTracks.length > 0 && (
          <section className="mb-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
                <h2 className="text-xl font-bold tracking-tight text-fg">
                  {songsSectionTitle}
                </h2>
              </div>
              {songsSectionTracks.length > 5 && (
                <button
                  onClick={() => setShowAllSongs((s) => !s)}
                  className="text-sm font-semibold text-brand hover:text-brand-glow transition-colors"
                >
                  {showAllSongs ? "Show less" : "View all"}
                </button>
              )}
            </div>
            {visibleSongs.map((track, i) => (
              <SongRow key={track.id} track={track} index={i + 1} queue={visibleSongs} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
