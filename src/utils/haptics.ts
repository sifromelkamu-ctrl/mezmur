// Best-effort haptic feedback for the web: navigator.vibrate is supported
// on Chrome/Android but is a silent no-op on iOS Safari and desktop
// browsers (there is no web API for iOS haptics) — this is the closest
// equivalent available to a web app, not a substitute for real native
// haptics in an eventual iOS/Android app shell.
function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

export const haptics = {
  light: () => vibrate(10),
  success: () => vibrate([10, 40, 15]),
  error: () => vibrate([15, 60, 15, 60, 15]),
};
