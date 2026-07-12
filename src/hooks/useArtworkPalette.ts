import { useEffect, useState } from "react";
import { derivePalette, extractPalette, type ArtworkPalette } from "../utils/colorExtraction";

const fallbackCache = new Map<string, ArtworkPalette>();

function fallbackPalette(gradient: [string, string]): ArtworkPalette {
  const key = `${gradient[0]}|${gradient[1]}`;
  let palette = fallbackCache.get(key);
  if (!palette) {
    palette = derivePalette(gradient[0], gradient[1]);
    fallbackCache.set(key, palette);
  }
  return palette;
}

// Resolves the premium color palette for a piece of artwork: colors
// sampled from the actual image when one is loaded, or a palette derived
// from the existing seeded placeholder gradient otherwise (no photo yet,
// still loading, or extraction failed) — so callers always get a palette
// that reads as intentional rather than a flat gray/black fallback.
export function useArtworkPalette(photoUrl: string | undefined, gradient: [string, string]): ArtworkPalette {
  const [extracted, setExtracted] = useState<ArtworkPalette | null>(null);

  useEffect(() => {
    setExtracted(null);
    if (!photoUrl) return;
    let cancelled = false;
    extractPalette(photoUrl).then((palette) => {
      if (!cancelled && palette) setExtracted(palette);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return extracted ?? fallbackPalette(gradient);
}
