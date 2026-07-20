// Heuristic "smart framing" for artwork — no ML model, no bundled weights.
// Approximates a focal point by finding where an image's visual detail
// (edges/contrast — the same signal faces, logos, and title text all
// produce, since flat backgrounds have almost none) is concentrated, then
// crops fully to a square around it — Spotify (and every other streaming
// app) always shows artwork edge-to-edge with zero letterboxing, so the
// default here always fully covers the square; it never leaves a gap for a
// blur layer to fill. That's still available, but only as a deliberate,
// manual admin choice in the editor — never the automatic default.
//
// This is a real, working technique (the same "energy map" idea behind
// classic seam-carving/smart-crop tools) — it is intentionally NOT framed
// as literal face/logo/text detection, which would require a real model.
import { clampFocal, coverZoom } from "./artworkTransform";

export interface SmartFrame {
  x: number; // focal point, 0-1 fraction of natural image width
  y: number; // focal point, 0-1 fraction of natural image height
  zoom: number; // suggested zoom relative to "whole image fits inside square" (1 = no crop)
}

const SAMPLE_SIZE = 64;

const cache = new Map<string, Promise<SmartFrame | null>>();

function analyze(img: HTMLImageElement): SmartFrame {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const zoom = coverZoom(w, h);
  // Whichever axis is the image's shorter side has zero slack once cropped
  // to fully cover the square — its focal point is pinned to 0.5. The
  // longer side is the only one with room to move off-center.
  const visibleFractionX = w <= h ? 1 : 1 / zoom;
  const visibleFractionY = h <= w ? 1 : 1 / zoom;
  const fallback = (): SmartFrame => ({
    x: clampFocal(0.5, visibleFractionX),
    // Nudged up slightly where there's slack — the one bias that holds for
    // most artwork: subjects/titles skew upper-frame more often than lower.
    y: clampFocal(0.42, visibleFractionY),
    zoom,
  });

  const canvas = document.createElement("canvas");
  const scale = SAMPLE_SIZE / Math.max(w, h);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback();

  ctx.drawImage(img, 0, 0, sw, sh);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    // Tainted canvas (no CORS headers) — fall back to a plain center focal point.
    return fallback();
  }

  const luminance = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = (y * sw + x) * 4;
      const left = luminance(i - 4);
      const right = luminance(i + 4);
      const up = luminance(i - sw * 4);
      const down = luminance(i + sw * 4);
      const energy = Math.abs(left - right) + Math.abs(up - down);
      sumWeight += energy;
      sumX += energy * x;
      sumY += energy * y;
    }
  }

  if (sumWeight < 1) return fallback();

  const rawX = sumX / sumWeight / sw;
  const rawY = sumY / sumWeight / sh;
  // Blend toward the upper-frame bias rather than fully trusting the raw
  // centroid — keeps the result stable for busy/textured backgrounds that
  // don't actually have a single clear subject.
  const x = rawX * 0.8 + 0.5 * 0.2;
  const y = rawY * 0.8 + 0.42 * 0.2;

  return {
    x: clampFocal(x, visibleFractionX),
    y: clampFocal(y, visibleFractionY),
    zoom,
  };
}

export function computeSmartFrame(url: string): Promise<SmartFrame | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = new Promise<SmartFrame | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(analyze(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });

  cache.set(url, promise);
  return promise;
}
