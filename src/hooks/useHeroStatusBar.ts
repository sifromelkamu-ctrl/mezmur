import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

// Hero-photo detail pages keep a dark scrim across the true top of the
// screen (see HeroTopScrim) regardless of the photo underneath, so the
// status bar icons sitting there need to stay white always — not follow
// the app's own light/dark mode the way they do everywhere else (see
// ThemeContext's applyMode). Left alone, a light-mode session would set
// them to dark icon content, invisible against that same dark scrim.
// Restores the theme-correct style on unmount, since every other page
// still wants icons that match the real mode.
export function useForceLightStatusBarIcons() {
  const { mode } = useTheme();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }); // Style.Dark = light/white icon content
    return () => {
      StatusBar.setStyle({ style: mode === "light" ? Style.Light : Style.Dark });
    };
  }, [mode]);
}
