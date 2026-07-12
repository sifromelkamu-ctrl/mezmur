// Shared pan/zoom/rotate/flip math for artwork framing — used identically
// by the live display (CoverArt) and the admin editor (ArtworkEditor) so
// the square always represents the exact same result in both places.
import type { ArtworkFrame } from "../lib/api";

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// The zoom (relative to "whole image fits inside the square") at which the
// image fully covers the square with no letterboxing.
export function coverZoom(naturalW: number, naturalH: number): number {
  if (!naturalW || !naturalH) return 1;
  return Math.max(naturalW, naturalH) / Math.min(naturalW, naturalH);
}

export interface RenderRect {
  baseScale: number;
  renderW: number;
  renderH: number;
  left: number;
  top: number;
}

// Where the image should sit inside a `squareSize`-px square, given the
// frame's zoom/focal point. Rotation and flip are separate transforms
// applied around this rect's center — they don't affect its own geometry.
export function computeRenderRect(
  frame: Pick<ArtworkFrame, "x" | "y" | "zoom">,
  naturalW: number,
  naturalH: number,
  squareSize: number
): RenderRect {
  const baseScale = squareSize / Math.max(naturalW || 1, naturalH || 1);
  const renderW = naturalW * baseScale * frame.zoom;
  const renderH = naturalH * baseScale * frame.zoom;
  return {
    baseScale,
    renderW,
    renderH,
    left: squareSize / 2 - frame.x * renderW,
    top: squareSize / 2 - frame.y * renderH,
  };
}

// True whenever the current frame leaves any part of the square uncovered
// by sharp image content — either because zoom hasn't reached full-cover,
// or because rotation has swung the (still axis-aligned-sized) image away
// from the square's corners. Drives whether the blurred-backdrop fill
// layer is needed.
export function hasLetterbox(frame: Pick<ArtworkFrame, "zoom" | "rotation">, naturalW: number, naturalH: number): boolean {
  if (Math.abs(frame.rotation) > 0.5) return true;
  return frame.zoom < coverZoom(naturalW, naturalH) - 0.01;
}

// Clamps a focal fraction so the square-covering crop window it anchors
// stays inside the image's own bounds along one axis — shared by the
// smart-crop heuristic (smartCrop.ts) and the manual editor
// (ArtworkEditor.tsx) so a focal point can never point the crop off the
// edge of the image.
export function clampFocal(value: number, visibleFraction: number): number {
  const half = visibleFraction / 2;
  if (half >= 0.5) return 0.5;
  return Math.min(1 - half, Math.max(half, value));
}

// Clamps frame.x/y so the crop window at the frame's current zoom never
// drifts past the image's own edges — i.e. the square stays fully covered
// by image content no matter how far the image is panned. The image is
// always at least as large as the square (that's what the editor's zoom
// floor at coverZoom guarantees) and can be positioned so any part of it
// "passes" outside the square; only the part still inside ever shows.
export function clampFramePosition(
  frame: Pick<ArtworkFrame, "x" | "y" | "zoom">,
  naturalW: number,
  naturalH: number
): Pick<ArtworkFrame, "x" | "y"> {
  // squareSize cancels out of the visible-fraction ratio, so any constant works.
  const { renderW, renderH } = computeRenderRect(frame, naturalW, naturalH, 1);
  const visibleFractionX = Math.min(1, 1 / renderW);
  const visibleFractionY = Math.min(1, 1 / renderH);
  return { x: clampFocal(frame.x, visibleFractionX), y: clampFocal(frame.y, visibleFractionY) };
}
