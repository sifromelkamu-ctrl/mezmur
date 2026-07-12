import { Check, FlipHorizontal, FlipVertical, Grid3x3, RefreshCcw, RotateCw, Undo2, Redo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArtworkFrame } from "../lib/api";
import { computeSmartFrame } from "../utils/smartCrop";
import { clamp, clampFramePosition, computeRenderRect, coverZoom } from "../utils/artworkTransform";

interface ArtworkEditorProps {
  photoUrl: string;
  initialFrame?: ArtworkFrame;
  onSave: (frame: ArtworkFrame) => void | Promise<void>;
  onClose: () => void;
}

// CROP_SIZE is the fixed crop window (never moves, matches what every other
// screen in the app renders as the final square) — every pan/zoom
// calculation below is expressed in this square's own pixel coordinate
// space. It sits inside a much bigger, unclipped viewport so the image can
// visibly bleed past its edges (dimmed) the way Apple Photos' crop tool
// shows the rest of the photo around the crop rectangle.
const CROP_SIZE = 320;
// Relative to minZoom (the "fully covers the square" floor) rather than an
// absolute number — an absolute floor below 100% would let the image go
// smaller than the square, which is the letterboxing this editor was
// specifically fixed to never allow (see minZoom below).
const ZOOM_RANGE_MULTIPLIER = 8;
const HISTORY_LIMIT = 50;
const PAN_FRICTION = 0.94;
const MIN_FLING_SPEED = 0.02; // px/ms
const MAX_FLING_SPEED = 3.5; // px/ms, clamps spurious huge deltas

function neutralFrame(): ArtworkFrame {
  return { x: 0.5, y: 0.42, zoom: 1, rotation: 0, flipH: false, flipV: false };
}

// Keeps the natural-image point currently under (px, py) — coordinates
// local to the CROP_SIZE square's own top-left — under that same point
// after zooming to newZoom, the standard "zoom toward pointer/pinch-
// midpoint" behavior.
function zoomToward(
  frame: ArtworkFrame,
  naturalW: number,
  naturalH: number,
  px: number,
  py: number,
  newZoom: number
): Pick<ArtworkFrame, "x" | "y" | "zoom"> {
  const rect = computeRenderRect(frame, naturalW, naturalH, CROP_SIZE);
  const u = frame.x + (px - CROP_SIZE / 2) / rect.renderW;
  const v = frame.y + (py - CROP_SIZE / 2) / rect.renderH;
  const newRect = computeRenderRect({ ...frame, zoom: newZoom }, naturalW, naturalH, CROP_SIZE);
  return {
    x: u - (px - CROP_SIZE / 2) / newRect.renderW,
    y: v - (py - CROP_SIZE / 2) / newRect.renderH,
    zoom: newZoom,
  };
}

function panBy(
  frame: ArtworkFrame,
  naturalW: number,
  naturalH: number,
  dxPx: number,
  dyPx: number
): Pick<ArtworkFrame, "x" | "y"> {
  const rect = computeRenderRect(frame, naturalW, naturalH, CROP_SIZE);
  return { x: frame.x - dxPx / rect.renderW, y: frame.y - dyPx / rect.renderH };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export default function ArtworkEditor({ photoUrl, initialFrame, onSave, onClose }: ArtworkEditorProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [smartFrame, setSmartFrame] = useState<ArtworkFrame | null>(null);
  const startFrame = useMemo(() => initialFrame ?? smartFrame ?? neutralFrame(), [initialFrame, smartFrame]);

  const [frame, setFrame] = useState<ArtworkFrame>(startFrame);
  const [history, setHistory] = useState<ArtworkFrame[]>([startFrame]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showGuides, setShowGuides] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const appliedInitial = useRef(false);

  // Never below "image exactly fills the square" — the picture must always
  // be allowed to pass beyond the square's edges so only the part inside it
  // is ever visible; below this zoom the image would be smaller than the
  // square, leaving a gap (letterbox) the editor should never produce.
  const minZoom = natural ? coverZoom(natural.w, natural.h) : 1;
  const maxZoom = minZoom * ZOOM_RANGE_MULTIPLIER;

  // Single choke point every pan/zoom update goes through: clamps zoom to
  // never uncover the square, then re-clamps x/y so the (possibly now
  // tighter) crop window still stays inside the image's own bounds.
  function clampFrame(next: ArtworkFrame): ArtworkFrame {
    if (!natural) return next;
    const zoom = clamp(next.zoom, minZoom, maxZoom);
    const { x, y } = clampFramePosition({ ...next, zoom }, natural.w, natural.h);
    return { ...next, zoom, x, y };
  }

  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ frame: ArtworkFrame; pointer: { x: number; y: number } } | null>(null);
  const pinchStart = useRef<{ frame: ArtworkFrame; dist: number; mid: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  const lastPointerPos = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const wasPanRef = useRef(false);
  const lastMove = useRef<{ x: number; y: number; t: number } | null>(null);
  const velocity = useRef({ x: 0, y: 0 });
  const inertiaRaf = useRef<number | null>(null);

  // Load natural dimensions + the heuristic smart-framing suggestion once.
  // If the caller already has a saved frame, that stays authoritative for
  // the starting position — the smart result is only the fallback default
  // and the "Auto" target.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = photoUrl;

    computeSmartFrame(photoUrl).then((result) => {
      if (cancelled) return;
      const next: ArtworkFrame = result
        ? { x: result.x, y: result.y, zoom: result.zoom, rotation: 0, flipH: false, flipV: false }
        : neutralFrame();
      setSmartFrame(next);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  // Once both natural size and the smart default have resolved, snap the
  // working frame to whichever start position applies (saved frame, if
  // any, otherwise the smart result) — but only once, so it doesn't stomp
  // on edits the admin has already made while this was loading.
  useEffect(() => {
    if (appliedInitial.current) return;
    if (!smartFrame) return;
    appliedInitial.current = true;
    // clampFrame here also catches a frame saved before this editor enforced
    // full-cover zoom (an old manual zoom-out) — opening the editor snaps it
    // straight to a proper crop instead of showing the stale letterboxed one.
    const snapped = clampFrame(startFrame);
    setFrame(snapped);
    setHistory([snapped]);
    setHistoryIndex(0);
  }, [smartFrame, startFrame]);

  useEffect(() => stopInertia, []);

  function pushHistory(next: ArtworkFrame) {
    setHistory((h) => {
      const truncated = h.slice(0, historyIndex + 1);
      const appended = [...truncated, next].slice(-HISTORY_LIMIT);
      setHistoryIndex(appended.length - 1);
      return appended;
    });
  }

  function commit(next: ArtworkFrame) {
    setFrame(next);
    pushHistory(next);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setFrame(history[idx]);
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setFrame(history[idx]);
  }

  function zoomByFactor(factor: number) {
    if (!natural) return;
    commit(clampFrame({ ...frame, zoom: frame.zoom * factor }));
  }

  function stopInertia() {
    if (inertiaRaf.current != null) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = null;
    }
  }

  // Coasts the pan with decaying velocity after a finger/pointer lifts
  // mid-swipe — the standard "flick to scroll" feel. Stops on its own once
  // speed drops below threshold, or effectively stops early once
  // clampFrame's position clamp holds the image at an edge.
  function startInertia() {
    stopInertia();
    if (!natural) return;
    let vx = clamp(velocity.current.x, -MAX_FLING_SPEED, MAX_FLING_SPEED);
    let vy = clamp(velocity.current.y, -MAX_FLING_SPEED, MAX_FLING_SPEED);
    if (Math.hypot(vx, vy) < MIN_FLING_SPEED) return;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last == null ? 16 : Math.min(32, now - last);
      last = now;
      vx *= PAN_FRICTION;
      vy *= PAN_FRICTION;
      if (Math.hypot(vx, vy) < MIN_FLING_SPEED) {
        inertiaRaf.current = null;
        setFrame((f) => {
          pushHistory(f);
          return f;
        });
        return;
      }
      setFrame((f) => {
        if (!natural) return f;
        const panned = panBy(f, natural.w, natural.h, vx * dt, vy * dt);
        return clampFrame({ ...f, ...panned });
      });
      inertiaRaf.current = requestAnimationFrame(step);
    };
    inertiaRaf.current = requestAnimationFrame(step);
  }

  function handleWheel(e: React.WheelEvent) {
    if (!natural) return;
    e.preventDefault();
    stopInertia();
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = clamp(frame.zoom * factor, minZoom, maxZoom);
    const next = zoomToward(frame, natural.w, natural.h, px, py, newZoom);
    setFrame(clampFrame({ ...frame, ...next }));
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    stopInertia();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    setIsInteracting(true);
    if (pointers.current.size === 1) {
      panStart.current = { frame, pointer: { x: e.clientX, y: e.clientY } };
      pinchStart.current = null;
      lastMove.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      velocity.current = { x: 0, y: 0 };
    } else if (pointers.current.size === 2 && natural) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { frame, dist: dist(a, b), mid: mid(a, b) };
      panStart.current = null;
      lastMove.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (pointers.current.size === 1 && panStart.current && natural) {
      const p = panStart.current.pointer;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggedRef.current = true;
      wasPanRef.current = true;
      const next = panBy(panStart.current.frame, natural.w, natural.h, dx, dy);
      setFrame((f) => clampFrame({ ...f, ...next }));

      const now = performance.now();
      if (lastMove.current) {
        const dt = now - lastMove.current.t;
        if (dt > 0) {
          velocity.current = {
            x: (e.clientX - lastMove.current.x) / dt,
            y: (e.clientY - lastMove.current.y) / dt,
          };
        }
      }
      lastMove.current = { x: e.clientX, y: e.clientY, t: now };
    } else if (pointers.current.size === 2 && pinchStart.current && natural) {
      draggedRef.current = true;
      wasPanRef.current = false;
      const [a, b] = [...pointers.current.values()];
      const curDist = dist(a, b);
      const curMid = mid(a, b);
      const rect = frameRef.current?.getBoundingClientRect();
      const anchorX = pinchStart.current.mid.x - (rect?.left ?? 0);
      const anchorY = pinchStart.current.mid.y - (rect?.top ?? 0);
      const scaleRatio = curDist / (pinchStart.current.dist || 1);
      const newZoom = clamp(pinchStart.current.frame.zoom * scaleRatio, minZoom, maxZoom);
      const zoomed = zoomToward(pinchStart.current.frame, natural.w, natural.h, anchorX, anchorY, newZoom);
      const panned = panBy(
        { ...pinchStart.current.frame, ...zoomed },
        natural.w,
        natural.h,
        -(curMid.x - pinchStart.current.mid.x),
        -(curMid.y - pinchStart.current.mid.y)
      );
      setFrame((f) => clampFrame({ ...f, ...zoomed, ...panned }));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      setIsInteracting(false);
      if (draggedRef.current) {
        commit(frame);
        if (wasPanRef.current) startInertia();
      } else {
        handleTap();
      }
      panStart.current = null;
      pinchStart.current = null;
      lastMove.current = null;
    } else if (pointers.current.size === 1) {
      // Dropped from pinch to single-finger — restart pan tracking cleanly.
      const [remaining] = [...pointers.current.values()];
      panStart.current = { frame, pointer: remaining };
      pinchStart.current = null;
      lastMove.current = { x: remaining.x, y: remaining.y, t: performance.now() };
      velocity.current = { x: 0, y: 0 };
    }
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      doubleTapZoom();
    } else {
      lastTap.current = now;
    }
  }

  // Double-tap zooms in on the tapped point when zoomed near the full-cover
  // floor, or back out to that floor when already zoomed in — the same
  // "toggle" feel as Apple Photos' double-tap, anchored under the finger
  // rather than the square's center.
  function doubleTapZoom() {
    if (!natural) return;
    const rect = frameRef.current?.getBoundingClientRect();
    const pos = lastPointerPos.current;
    const px = pos && rect ? pos.x - rect.left : CROP_SIZE / 2;
    const py = pos && rect ? pos.y - rect.top : CROP_SIZE / 2;
    const zoomedIn = frame.zoom > minZoom * 1.15;
    const targetZoom = zoomedIn ? minZoom : Math.min(minZoom * 2.5, maxZoom);
    const next = zoomToward(frame, natural.w, natural.h, px, py, targetZoom);
    commit(clampFrame({ ...frame, ...next }));
  }

  function rotate90() {
    // Wraps into (-180, 180] so it stays consistent with the straighten slider's range.
    commit({ ...frame, rotation: ((frame.rotation + 90 + 180) % 360) - 180 });
  }
  function flipHorizontal() {
    commit({ ...frame, flipH: !frame.flipH });
  }
  function flipVertical() {
    commit({ ...frame, flipV: !frame.flipV });
  }
  function resetToSmart() {
    if (!smartFrame) return;
    commit(clampFrame(smartFrame));
  }
  function resetToStart() {
    commit(clampFrame(startFrame));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(frame);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const { renderW, renderH, left, top } = natural
    ? computeRenderRect(frame, natural.w, natural.h, CROP_SIZE)
    : { renderW: 0, renderH: 0, left: 0, top: 0 };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-xl select-none">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-90 transition-all"
          aria-label="Cancel"
        >
          <X size={20} />
        </button>
        <p className="text-sm font-semibold text-white">Edit Artwork</p>
        <button
          onClick={handleSave}
          disabled={saving || !natural}
          className="w-10 h-10 rounded-full flex items-center justify-center text-brand hover:bg-white/10 active:scale-90 transition-all disabled:opacity-40"
          aria-label="Save"
        >
          <Check size={22} />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative flex-1 flex items-center justify-center min-h-0 px-4 overflow-hidden touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          ref={frameRef}
          className="relative shrink-0"
          style={{
            width: CROP_SIZE,
            height: CROP_SIZE,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25), 0 0 0 2000px rgba(0,0,0,0.62)",
            borderRadius: 16,
          }}
        >
          {natural && (
            <div
              className="absolute inset-0"
              style={{
                transform: `rotate(${frame.rotation}deg)`,
                transformOrigin: "center",
                willChange: "transform",
              }}
            >
              <img
                src={photoUrl}
                alt=""
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  width: renderW,
                  height: renderH,
                  transform: `translate(${left}px, ${top}px) scaleX(${frame.flipH ? -1 : 1}) scaleY(${frame.flipV ? -1 : 1})`,
                  transformOrigin: "top left",
                  willChange: "transform",
                  imageRendering: "auto",
                }}
              />
            </div>
          )}

          {(showGuides || isInteracting) && (
            <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
              {[1 / 3, 2 / 3].map((f) => (
                <div key={`v${f}`} className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: `${f * 100}%` }} />
              ))}
              {[1 / 3, 2 / 3].map((f) => (
                <div key={`h${f}`} className="absolute left-0 right-0 h-px bg-white/40" style={{ top: `${f * 100}%` }} />
              ))}
            </div>
          )}

          {!natural && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">Loading…</div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => zoomByFactor(1 / 1.25)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all shrink-0"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={Math.log(minZoom)}
            max={Math.log(maxZoom)}
            step={0.001}
            value={Math.log(frame.zoom)}
            onChange={(e) => setFrame(clampFrame({ ...frame, zoom: Math.exp(Number(e.target.value)) }))}
            onPointerUp={() => commit(frame)}
            className="flex-1 accent-brand"
            aria-label="Zoom"
          />
          <button
            onClick={() => zoomByFactor(1.25)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all shrink-0"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-[11px] font-semibold text-white/50 w-14 shrink-0">Straighten</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.1}
            value={frame.rotation}
            onChange={(e) => setFrame({ ...frame, rotation: clamp(Number(e.target.value), -180, 180) })}
            onPointerUp={() => commit(frame)}
            className="flex-1 accent-brand"
            aria-label="Straighten"
          />
          <span className="text-[11px] tabular-nums text-white/50 w-9 shrink-0 text-right">{frame.rotation.toFixed(0)}°</span>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-90 transition-all disabled:opacity-30"
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-90 transition-all disabled:opacity-30"
            aria-label="Redo"
          >
            <Redo2 size={17} />
          </button>
          <button
            onClick={resetToStart}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-90 transition-all"
            aria-label="Reset"
          >
            <RefreshCcw size={16} />
          </button>
          <button
            onClick={rotate90}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-90 transition-all"
            aria-label="Rotate 90 degrees"
          >
            <RotateCw size={17} />
          </button>
          <button
            onClick={flipHorizontal}
            className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all ${frame.flipH ? "text-brand" : "text-white/80"}`}
            aria-label="Flip horizontal"
          >
            <FlipHorizontal size={17} />
          </button>
          <button
            onClick={flipVertical}
            className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all ${frame.flipV ? "text-brand" : "text-white/80"}`}
            aria-label="Flip vertical"
          >
            <FlipVertical size={17} />
          </button>
          <button
            onClick={() => setShowGuides((g) => !g)}
            className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all ${showGuides ? "text-brand" : "text-white/80"}`}
            aria-label="Toggle guides"
          >
            <Grid3x3 size={17} />
          </button>
        </div>

        <button
          onClick={resetToSmart}
          className="w-full mt-4 text-center text-xs font-semibold text-white/50 hover:text-white/80 transition-colors"
        >
          Auto
        </button>
      </div>
    </div>,
    document.body
  );
}
