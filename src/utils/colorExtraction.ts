// Client-side dominant-color extraction for artwork images, used to tint
// each artwork's surrounding frame (background wash, shadow, border
// highlight) with colors sampled from the image itself instead of a
// generic placeholder. Pure rendering concern — never touches playback,
// imports, or persisted data; results are cached in memory per image URL
// for the lifetime of the tab.
import { runLimited } from "./concurrencyLimit";

export interface ArtworkPalette {
  primary: string;
  secondary: string;
  background: string;
  shadow: string;
}

type RGB = [number, number, number];
type HSL = [number, number, number];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

export function rgbToHex([r, g, b]: RGB): string {
  const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Adjusts a swatch toward a target lightness/saturation in HSL space —
// used to derive a deep background wash and a soft shadow tint from the
// two extracted swatches, so every accent color feels like it came from
// the same artwork rather than being picked independently.
export function shade(hex: string, targetL: number, satMul: number): string {
  const [h, s, _l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, clamp01(s * satMul), clamp01(targetL)]));
}

export function derivePalette(primaryHex: string, secondaryHex: string): ArtworkPalette {
  const [h1, s1] = rgbToHsl(hexToRgb(primaryHex));
  const [h2, s2] = rgbToHsl(hexToRgb(secondaryHex));
  const avgHue = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 % 360 : (h1 + h2) / 2;
  const avgSat = (s1 + s2) / 2;
  return {
    primary: primaryHex,
    secondary: secondaryHex,
    background: rgbToHex(hslToRgb([avgHue, clamp01(avgSat * 0.75), 0.16])),
    shadow: rgbToHex(hslToRgb([avgHue, clamp01(avgSat * 0.55), 0.07])),
  };
}

// Buckets pixels into a coarse RGB grid and returns the two most common,
// sufficiently-distinct swatches (falling back to a lightness split when
// the artwork is monochrome, since a near-flat histogram would otherwise
// yield two near-identical buckets).
function paletteFromPixels(data: Uint8ClampedArray): [string, string] {
  type Bucket = { count: number; r: number; g: number; b: number };
  const vibrant = new Map<number, Bucket>();
  const all = new Map<number, Bucket>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;

    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bucket = all.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      all.set(key, { count: 1, r, g, b });
    }

    const nearWhite = r > 238 && g > 238 && b > 238;
    const nearBlack = r < 18 && g < 18 && b < 18;
    if (nearWhite || nearBlack) continue;
    const vBucket = vibrant.get(key);
    if (vBucket) {
      vBucket.count++;
      vBucket.r += r;
      vBucket.g += g;
      vBucket.b += b;
    } else {
      vibrant.set(key, { count: 1, r, g, b });
    }
  }

  const avg = (b: Bucket): RGB => [b.r / b.count, b.g / b.count, b.b / b.count];
  const source = vibrant.size > 0 ? vibrant : all;
  const sorted = [...source.values()].sort((a, b) => b.count - a.count);
  if (sorted.length === 0) return ["#3a3a3c", "#1c1c1e"];

  const primaryRgb = avg(sorted[0]);
  const primaryHsl = rgbToHsl(primaryRgb);

  let secondaryRgb: RGB | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const candidate = avg(sorted[i]);
    const [h, , l] = rgbToHsl(candidate);
    const hueDist = Math.min(Math.abs(h - primaryHsl[0]), 360 - Math.abs(h - primaryHsl[0]));
    if (hueDist > 24 || Math.abs(l - primaryHsl[2]) > 0.18) {
      secondaryRgb = candidate;
      break;
    }
  }

  const primaryHex = rgbToHex(primaryRgb);
  if (!secondaryRgb) {
    // Monochrome (or near-monochrome) artwork — split by lightness instead
    // of hue so the pair still reads as "from this image," in grayscale.
    const darker = primaryHsl[2] > 0.5;
    return [primaryHex, shade(primaryHex, darker ? primaryHsl[2] - 0.3 : primaryHsl[2] + 0.3, 1)];
  }
  return [primaryHex, rgbToHex(secondaryRgb)];
}

const SAMPLE_SIZE = 48;
const cache = new Map<string, ArtworkPalette | null>();
const inflight = new Map<string, Promise<ArtworkPalette | null>>();

export function extractPalette(url: string): Promise<ArtworkPalette | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = runLimited(() => new Promise<ArtworkPalette | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          cache.set(url, null);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const [primary, secondary] = paletteFromPixels(data);
        const palette = derivePalette(primary, secondary);
        cache.set(url, palette);
        resolve(palette);
      } catch {
        // Tainted canvas (no CORS headers) or decode failure — caller falls
        // back to the seeded-gradient-derived palette.
        cache.set(url, null);
        resolve(null);
      }
    };
    img.onerror = () => {
      cache.set(url, null);
      resolve(null);
    };
    img.src = url;
  }));

  inflight.set(url, promise);
  promise.finally(() => inflight.delete(url));
  return promise;
}
