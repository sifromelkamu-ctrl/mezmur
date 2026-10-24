import {
  Check,
  Heart,
  Link2,
  MoreHorizontal,
  Music2,
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
import HeroTopScrim from "../components/HeroTopScrim";
import TrackRow from "../components/TrackRow";
import { useAuth } from "../context/useAuth";
import { usePlayer } from "../context/PlayerContext";
import {
  adminApi,
  albumsApi,
  artistsApi,
  type ApiAlbum,
  type ApiAlbumType,
  type ApiArtistDetail,
} from "../lib/api";
import { cachedDetailFetch } from "../lib/detailCache";

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
// language as Card, snap-x child. No frame/background/border around the
// art itself (an earlier version wrapped it in a padded, bordered card,
// which made 160px-wide art read as noticeably smaller inside a "gray
// frame") — just the art and its own shadow, so the artwork itself stays
// the visually prominent element.
function AlbumCard({
  album,
  to,
  playing,
  onPlay,
}: {
  album: ApiAlbum;
  to: string;
  playing: boolean;
  onPlay: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(to)}
      className="snap-start shrink-0 w-40 group cursor-pointer active:scale-[0.97] transition-transform duration-100"
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
            playing ? "ring-2 ring-brand/60 shadow-[0_0_14px_rgba(242,183,5,0.55)]" : ""
          }`}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-brand flex items-center justify-center text-black opacity-0 group-hover:opacity-100 active:scale-90 transition-all shadow-lg"
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
  const [activeTab, setActiveTab] = useState<"albums" | "songs">("albums");
  const [addingAlbum, setAddingAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  const [newAlbumType, setNewAlbumType] = useState<ApiAlbumType>("album");
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [addAlbumError, setAddAlbumError] = useState<string | null>(null);
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
    setActiveTab("albums");
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
  const previewSongs = songsSectionTracks.slice(0, 5);

  return (
    // Flat, not a gradient — the hero→dark transition lives entirely on the
    // hero below, scoped to its own fixed height (see comment there).
    // Keeping a second, page-length-based gradient here was the bug: its
    // color stops are percentages of the *whole page*, so on a shorter page
    // (short bio, few albums) the hero's fixed-height bottom edge landed
    // mid-transition, producing a visible hard seam. A flat fill always
    // matches exactly.
    //
    // Tinted by this artist's gradient (same color the hero wash below
    // fades into) rather than a theme token — this area also backs the
    // action-button row right below the hero, whose white/translucent
    // icons need a consistently dark backdrop regardless of light/dark
    // mode. Theme-following colors only start at the content surface
    // further down (see the transition strip right above it).
    //
    // No paddingTop to compensate the negative margin above — the hero
    // photo (this div's first child) is meant to bleed all the way under
    // the status bar/notch, not stop short of it behind a flat strip of
    // this background color. BackButton's "glass" variant and the "..."
    // menu button already position themselves with their own explicit
    // `top-[calc(env(safe-area-inset-top)+1.25rem)]` offset for exactly
    // this reason — they don't need this wrapper to push content down for
    // them.
    <div style={{ backgroundColor: artist.gradient[1], marginTop: "calc(-1 * env(safe-area-inset-top))" }}>
      <div className="relative w-full overflow-hidden" style={{ height: "min(36vh, 320px)" }}>
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
        {/* Tinted by this artist's own gradient (same idea as AlbumDetail's
            hero wash using album.gradient) rather than one fixed hue for
            every artist — stays fully transparent for the top half of the
            photo (an earlier version started darkening at 18% and stacked a
            second black overlay on top, washing out most of the picture)
            and only darkens the bottom third, resolving to solid
            artist.gradient[1] by its own bottom edge — the exact same color
            the flat page background below uses, so there's no seam between
            the photo and the action-button row sitting on that background.
            A gentler alpha ramp than an earlier version (33/80/b3 instead
            of 4d/99/dd) — for a vivid/warm gradient color (orange, red) the
            stronger ramp read as an oversaturated wash competing with the
            name instead of a subtle legibility aid. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 48%, ${artist.gradient[1]}33 62%, ${artist.gradient[1]}80 75%, ${artist.gradient[1]}b3 90%, ${artist.gradient[1]} 100%)`,
          }}
        />

        <HeroTopScrim />
        <BackButton variant="glass" />
        {/* Same reasoning as BackButton's "glass" variant: this floats near
            the true top of the screen inside a hero whose negative margin
            cancels the page's ambient safe-area padding, so it needs its
            own explicit inset to clear the system UI touch zone up there
            (status bar on Android, Dynamic Island on newer iPhones). */}
        <div className="absolute top-[calc(env(safe-area-inset-top)+1.25rem)] right-4">
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

        {/* select-none: without it, a long-press anywhere in here (common on
            a touch device, even unintentionally) triggers the browser's own
            native text-selection UI — a blue caret, drag handles, the whole
            "select/copy" affordance — over what's meant to read as plain
            app chrome, not a selectable web page. */}
        <div className="absolute bottom-0 inset-x-0 p-6 select-none">
          {/* No checkmark/"verified" framing — this app has no real
              verification concept for artists (no such field exists on the
              model), so a checkmark here would only ever be a fabricated
              signal. Still a useful "this is an artist profile" type badge,
              same idea as AlbumDetail's plain "Album" badge. */}
          <div className="inline-flex items-center rounded-full border border-brand/50 bg-brand-dark/40 px-3 py-1 mb-3 backdrop-blur-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-brand-glow">Artist</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight break-words text-white">{artist.name}</h1>
          {artist.monthlyListeners > 0 && (
            <p className="text-sm text-white/70 mt-1">{artist.monthlyListeners.toLocaleString()} monthly listeners</p>
          )}
        </div>
      </div>

      <div className="px-6 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 bg-brand text-black font-bold rounded-full pl-5 pr-6 py-3 shadow-lg shadow-brand/40 hover:scale-105 transition-transform"
            aria-label="Play"
          >
            <Play size={18} fill="black" />
            Play
          </button>
          <button
            onClick={handleShuffle}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/15 ${
              shuffle ? "text-brand-glow" : "text-white/75"
            }`}
            aria-label="Shuffle"
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={() => setFollowing((f) => !f)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/15 ${
              following ? "text-brand-glow" : "text-white/75"
            }`}
            aria-label={following ? "Unfollow artist" : "Follow artist"}
          >
            <Heart size={17} fill={following ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleShare}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/75 transition-colors"
            aria-label="Share artist"
          >
            {copied ? <Check size={18} className="text-brand-glow" /> : <Share2 size={18} />}
          </button>
        </div>
      </div>

      {/* Bridges the artist-tinted area above (hero + action-button row,
          deliberately dark regardless of theme — see the wrapper's own
          comment) into the content surface's real light/dark background
          right below, instead of jumping straight from one to the other —
          that hard cut was the actual seam; the button row and the content
          surface were always two genuinely different colors, never
          supposed to match outright. */}
      <div
        aria-hidden="true"
        style={{ height: "28px", backgroundImage: `linear-gradient(180deg, ${artist.gradient[1]}, var(--color-panel))` }}
      />

      {/* Bright content surface — everything from here down follows the
          app's real light/dark theme (unlike the hero and button row
          above, which stay tinted by this artist's own gradient always). */}
      <div
        className="relative rounded-t-[32px] px-5 sm:px-6 pt-6 pb-10 bg-panel"
        style={{ boxShadow: "0 -12px 32px rgba(0,0,0,0.12)" }}
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

        {/* Replaces an old static album/song-count card with real
            navigation — the content below now only ever shows one of the
            two, so the switch doubles as an at-a-glance summary of which
            you're looking at. Brand-colored underline matches every other
            "now playing"/active-state accent elsewhere in the app. */}
        <div className="flex items-center gap-6 mb-6 border-b border-border">
          {(
            [
              { id: "albums" as const, label: "Albums" },
              { id: "songs" as const, label: "Songs" },
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative pb-3 text-base font-semibold transition-colors ${
                activeTab === tab.id ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </button>
          ))}
        </div>

        {activeTab === "albums" && isAdmin &&
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

        {activeTab === "albums" && (
          <>
            {artist.albums.length === 0 && !addingAlbum && (
              <div className="flex items-center gap-3 text-sm rounded-lg p-4 max-w-md mb-10 text-fg-muted bg-elevated border border-border">
                <Music2 size={18} />
                No albums yet{isAdmin ? " — add one above." : " — check back soon."}
              </div>
            )}

            {ALBUM_TYPE_ORDER.filter((type) => albumsByType[type].length > 0).map((type) => (
              <section key={type} className="mb-8">
                {/* The plain "album" type's own section label is literally
                    "Albums" — the exact same word the active tab right above
                    already says, so showing it again here read as a flat-out
                    duplicate heading. EPs/Singles/Compilations keep theirs
                    since those genuinely need their own label to tell them
                    apart from each other within this same tab. */}
                {type !== "album" && (
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
                    <h2 className="text-xl font-bold tracking-tight text-fg">
                      {ALBUM_TYPE_SECTION_LABEL[type]}
                    </h2>
                  </div>
                )}
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
                    />
                  ))}
                </div>
              </section>
            ))}

            {/* A preview, not the full list — "See All" jumps to the Songs
                tab rather than expanding in place, so this tab stays a
                short overview of both an artist's albums and their songs
                (matching what each tab's own label promises). */}
            {previewSongs.length > 0 && (
              <section className="mb-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
                    <h2 className="text-xl font-bold tracking-tight text-fg">{songsSectionTitle}</h2>
                  </div>
                  {songsSectionTracks.length > 5 && (
                    <button
                      onClick={() => setActiveTab("songs")}
                      className="text-sm font-semibold text-brand hover:text-brand-glow transition-colors"
                    >
                      See All
                    </button>
                  )}
                </div>
                {previewSongs.map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i + 1} queue={songsSectionTracks} showArtistName={false} showActions />
                ))}
              </section>
            )}
          </>
        )}

        {activeTab === "songs" && (
          <section className="mb-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-brand to-brand-dark" />
              <h2 className="text-xl font-bold tracking-tight text-fg">{songsSectionTitle}</h2>
            </div>
            {songsSectionTracks.length > 0 ? (
              songsSectionTracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i + 1} queue={songsSectionTracks} showArtistName={false} showActions />
              ))
            ) : (
              <div className="flex items-center gap-3 text-sm rounded-lg p-4 max-w-md text-fg-muted bg-elevated border border-border">
                <Music2 size={18} />
                No songs yet.
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
