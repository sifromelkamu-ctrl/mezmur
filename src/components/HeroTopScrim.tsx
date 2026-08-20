import { useForceLightStatusBarIcons } from "../hooks/useHeroStatusBar";

// A deliberate, always-present dark vignette across the true top of a
// photo hero (status bar / Dynamic Island strip) — independent of the
// photo's own brightness there. Some artist/album photos are dark at the
// top, some are light, and relying on "hopefully dark enough" left status
// bar icons unreadable half the time — worse, invisible outright when the
// app's light-mode setting put dark icon content over this same dark strip.
// Pairs with useForceLightStatusBarIcons, which keeps the icons white; this
// scrim is what actually guarantees they show up against it.
export default function HeroTopScrim() {
  useForceLightStatusBarIcons();
  return (
    <div
      className="absolute inset-x-0 top-0 pointer-events-none"
      style={{
        height: "calc(env(safe-area-inset-top) + 2.5rem)",
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 55%, transparent 100%)",
      }}
    />
  );
}
