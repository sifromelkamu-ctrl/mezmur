import { useEffect, useState } from "react";
import type { ArtworkFrame } from "../lib/api";
import { computeSmartFrame } from "../utils/smartCrop";

// Resolves the heuristic "smart framing" default for an image — the
// starting point the admin editor opens with when no manual edit has been
// saved yet, and what CoverArt falls back to for the same reason. Returns
// null until the (cached, one-time-per-URL) analysis resolves.
export function useSmartFrame(photoUrl: string | undefined): ArtworkFrame | null {
  const [frame, setFrame] = useState<ArtworkFrame | null>(null);

  useEffect(() => {
    setFrame(null);
    if (!photoUrl) return;
    let cancelled = false;
    computeSmartFrame(photoUrl).then((result) => {
      if (cancelled) return;
      setFrame({
        x: result?.x ?? 0.5,
        y: result?.y ?? 0.36,
        zoom: result?.zoom ?? 1,
        rotation: 0,
        flipH: false,
        flipV: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return frame;
}
