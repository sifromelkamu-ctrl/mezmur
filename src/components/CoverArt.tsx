import { Music2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useArtworkPalette } from "../hooks/useArtworkPalette";
import { useSmartFrame } from "../hooks/useSmartFrame";
import { adminApi, type ArtworkEntityType, type ArtworkFrame } from "../lib/api";
import { emitArtworkChanged } from "../lib/artworkEvents";
import { coverZoom, computeRenderRect, hasLetterbox } from "../utils/artworkTransform";
import ArtworkEditor from "./ArtworkEditor";

interface CoverArtProps {
  gradient: [string, string];
  size?: "sm" | "md" | "lg" | "xl" | "artist" | "card" | "albumHero" | "albumHeroLg";
  rounded?: boolean;
  photoUrl?: string;
  className?: string;
  // Universal Artwork System: identifies which record a saved artworkFrame
  // (and admin edits) belong to. Omit for artwork with no backing record
  // (e.g. a raw external preview thumbnail) — it just renders normally.
  entityType?: ArtworkEntityType;
  entityId?: string;
  artworkFrame?: ArtworkFrame;
  // Called with the newly-saved frame after a successful admin edit, so the
  // caller can update its own local copy without a full re-fetch.
  onFrameSaved?: (frame: ArtworkFrame) => void;
  // Suppresses CoverArt's own corner "Edit Artwork" button — for the rare
  // page that already has its own admin hover-overlay (e.g. AlbumDetail's
  // Upload/Remove controls) which would otherwise visually bury it. That
  // page hosts its own trigger into <ArtworkEditor> directly instead.
  hideEditButton?: boolean;
  // "Album Artwork Is Master Artwork": a track belonging to an album has no
  // artwork of its own to edit anymore (see server toTrackDTO) — this
  // suppresses just the edit button for such tracks, while still rendering
  // the (album-sourced) artworkFrame normally. Distinct from hideEditButton,
  // which suppresses the button for a page that has its own edit trigger.
  readOnlyArtwork?: boolean;
  // Skips the smart-crop heuristic (see smartCrop.ts) in favor of a plain
  // centered crop — for content whose source images routinely defeat that
  // heuristic. Concert Album art is typically an unedited YouTube thumbnail
  // with a bold text banner/title card across the top; the energy-map
  // analysis reads that high-contrast text as the focal point and drags the
  // crop up, cutting off the actual photo below it. A saved artworkFrame
  // (a deliberate manual edit) still always wins over this.
  preferCenter?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "w-12 h-12",
  md: "w-full aspect-square",
  lg: "w-full aspect-square",
  xl: "w-36 h-36",
  // Phone-scale sizes used on Home: circular artist portraits and square
  // album/playlist covers, both noticeably larger than the compact `md`
  // card art used elsewhere (Library, search results, etc.). Fixed values —
  // this app targets phone screens only, no desktop/tablet breakpoints.
  artist: "w-[100px] h-[100px]",
  card: "w-40 h-40",
  // Spotify-style oversized album hero art (AlbumDetail only) — roughly
  // 55-80% bigger than `xl`'s 144px, scaling up further on wider viewports.
  albumHero: "w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72",
  // Concert Album hero art (ConcertDetail only) — exactly 20% bigger than
  // albumHero at every breakpoint.
  albumHeroLg: "w-[269px] h-[269px] sm:w-[307px] sm:h-[307px] md:w-[346px] md:h-[346px]",
};

const roundedXlClass = "w-20 h-20";

// One consistent "no artwork" badge, used everywhere (tracks, albums,
// playlists, artists, sermons, podcasts) instead of a different generated
// pattern per item — simpler and reads as more deliberate/premium.
const badgeSizes: Record<string, { badge: string; icon: number }> = {
  sm: { badge: "w-7 h-7", icon: 14 },
  md: { badge: "w-1/2 h-auto aspect-square max-w-14", icon: 22 },
  lg: { badge: "w-1/2 h-auto aspect-square max-w-14", icon: 22 },
  xl: { badge: "w-16 h-16", icon: 32 },
  artist: { badge: "w-12 h-12", icon: 26 },
  card: { badge: "w-16 h-16", icon: 32 },
  albumHero: { badge: "w-24 h-24", icon: 44 },
  albumHeroLg: { badge: "w-28 h-28", icon: 52 },
};

// Editing the tiny 48px row thumbnails (track rows, queue, mini player)
// would be too cramped to be usable — admins edit those covers from a
// larger showcase view of the same artwork (album/track detail, etc.).
const EDITABLE_SIZES = new Set(["md", "lg", "xl", "artist", "card", "albumHero", "albumHeroLg"]);

export default function CoverArt({
  gradient,
  size = "md",
  rounded = false,
  photoUrl,
  className = "",
  entityType,
  entityId,
  artworkFrame,
  onFrameSaved,
  hideEditButton = false,
  readOnlyArtwork = false,
  preferCenter = false,
}: CoverArtProps) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [editing, setEditing] = useState(false);
  // Reflects a just-saved edit immediately in this instance, without
  // waiting on the parent's data to refetch (other instances of the same
  // artwork elsewhere on screen pick it up whenever they next re-fetch).
  const [savedOverride, setSavedOverride] = useState<ArtworkFrame | undefined>(undefined);
  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const palette = useArtworkPalette(showPhoto ? photoUrl : undefined, gradient);

  // A track's own artwork only exists at all when it has no album ("Album
  // Artwork Is Master Artwork" — see readOnlyArtwork's doc above): every
  // editable (!readOnlyArtwork) track CoverArt is therefore always a
  // standalone Single, never an album/artist's shared image. That's the
  // "Singles only" gate for the freeform crop floor below.
  const allowFreeformCrop = entityType === "track" && !readOnlyArtwork;
  const canFrame = showPhoto && Boolean(entityType && entityId) && !rounded;
  // preferCenter skips the smart-crop analysis (and its canvas work)
  // entirely in favor of a plain frame anchored a bit below dead-center —
  // still correctly zoomed to fully cover the square once the image's
  // natural size is known. Biased downward (not a flat 0.5) because a
  // Concert Album's unedited YouTube thumbnail routinely has its title-card
  // banner text in the top portion, which a plain center crop still caught
  // too much of.
  const smartFrame = useSmartFrame(canFrame && !preferCenter ? photoUrl : undefined);
  const centerFrame: ArtworkFrame | null = preferCenter
    ? { x: 0.5, y: 0.65, zoom: natural ? coverZoom(natural.w, natural.h) : 1, rotation: 0, flipH: false, flipV: false }
    : null;
  const activeFrame = savedOverride ?? artworkFrame ?? (preferCenter ? centerFrame : smartFrame);
  const frameReady = canFrame && Boolean(natural) && Boolean(activeFrame);

  const canEdit = Boolean(
    !hideEditButton &&
      !readOnlyArtwork &&
      user?.role === "admin" &&
      entityType &&
      entityId &&
      showPhoto &&
      EDITABLE_SIZES.has(size)
  );

  // Re-arm the fade-in whenever the artwork itself changes (e.g. skipping to
  // the next track) so each new image gets its own transition instead of
  // silently popping in at whatever opacity the previous one left behind.
  // An already-cached image still fades in, but near-instantly, since the
  // browser resolves it from cache before the transition would be visible.
  useEffect(() => {
    setLoaded(false);
    setPhotoFailed(false);
    setNatural(null);
    setSavedOverride(undefined);
  }, [photoUrl]);

  const resolvedSizeClass = rounded && size === "xl" ? roundedXlClass : sizeClasses[size];
  const badge = badgeSizes[size];
  const roundedClass =
    rounded ? "rounded-full" : size === "card" || size === "albumHero" || size === "albumHeroLg" ? "rounded-2xl" : "rounded-md";

  // Until the smart/saved frame and natural dimensions are both known, fall
  // back to plain object-cover so something reasonable shows immediately —
  // never object-contain, which is exactly what produced visible letterbox
  // borders. Once ready, the frame-based render below always fully covers
  // the square too, by construction (see smartCrop.ts): the blurred-backdrop
  // fill only ever appears for a rotation or a deliberate manual under-zoom
  // an admin explicitly saved, never as automatic/default behavior.
  const showBackdrop = Boolean(
    frameReady && natural && activeFrame && hasLetterbox(activeFrame, natural.w, natural.h) && showPhoto && !rounded
  );

  const framed = size !== "sm";
  const frameStyle: React.CSSProperties = framed
    ? {
        boxShadow: [
          `0 14px 32px -12px ${palette.shadow}b3`,
          `inset 0 0 0 1px ${palette.primary}26`,
          showBackdrop ? `inset 0 0 46px 10px ${palette.background}80` : null,
        ]
          .filter(Boolean)
          .join(", "),
      }
    : {};

  const rect = frameReady && natural && activeFrame ? computeRenderRect(activeFrame, natural.w, natural.h, 1000) : null;

  return (
    <div
      className={`group/art relative overflow-hidden ${resolvedSizeClass} ${roundedClass} flex items-center justify-center shrink-0 ${framed ? "" : "shadow-lg"} ${className}`}
      style={frameStyle}
    >
      <div
        key={`${palette.primary}-${palette.secondary}`}
        className="absolute inset-0 bg-crossfade"
        style={{
          backgroundImage: `radial-gradient(130% 130% at 12% 12%, rgba(255,255,255,0.22), transparent 45%), linear-gradient(150deg, ${palette.primary}, ${palette.secondary})`,
        }}
      />
      {showBackdrop && (
        <>
          {/* Same fit/position as the sharp foreground image, just scaled up
              and blurred — so the blur reads as a smeared continuation of
              the artwork's own edge pixels instead of a mismatched crop. */}
          <img
            src={photoUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain scale-125 opacity-90"
            style={{ filter: "blur(36px)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(140% 140% at 50% 50%, transparent 60%, ${palette.background}b3 100%)`,
            }}
          />
        </>
      )}
      {showPhoto &&
        (frameReady && rect && activeFrame ? (
          <div
            className="absolute inset-0"
            style={{ transform: `rotate(${activeFrame.rotation}deg)`, transformOrigin: "center" }}
          >
            <img
              src={photoUrl}
              alt=""
              loading="lazy"
              className={`absolute transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              style={{
                width: `${(rect.renderW / 1000) * 100}%`,
                height: `${(rect.renderH / 1000) * 100}%`,
                left: `${(rect.left / 1000) * 100}%`,
                top: `${(rect.top / 1000) * 100}%`,
                transform: `scaleX(${activeFrame.flipH ? -1 : 1}) scaleY(${activeFrame.flipV ? -1 : 1})`,
                transformOrigin: "center",
              }}
              onLoad={(e) => {
                setLoaded(true);
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
              }}
              onError={() => setPhotoFailed(true)}
            />
          </div>
        ) : (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={(e) => {
              setLoaded(true);
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            }}
            onError={() => setPhotoFailed(true)}
          />
        ))}
      {!showPhoto && (
        <div
          className={`relative rounded-full flex items-center justify-center bg-white/10 ring-1 ring-white/25 backdrop-blur-sm shadow-inner ${badge.badge}`}
        >
          <Music2 size={badge.icon} className="text-white/90" strokeWidth={1.5} />
        </div>
      )}
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setEditing(true);
          }}
          className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover/art:opacity-100 focus-visible:opacity-100 active:scale-90 transition-all"
          aria-label="Edit artwork"
        >
          <Pencil size={13} />
        </button>
      )}
      {editing && photoUrl && entityType && entityId && (
        <ArtworkEditor
          photoUrl={photoUrl}
          initialFrame={artworkFrame}
          allowFreeform={allowFreeformCrop}
          onClose={() => setEditing(false)}
          onSave={async (frame) => {
            await adminApi.setArtworkFrame(entityType, entityId, frame);
            setSavedOverride(frame);
            onFrameSaved?.(frame);
            emitArtworkChanged({ entityType, entityId, patch: { artworkFrame: frame } });
          }}
        />
      )}
    </div>
  );
}
