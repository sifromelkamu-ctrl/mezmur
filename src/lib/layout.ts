// Matches `<main>`'s own bottom scroll padding (App.tsx's `pb-48`, 192px) —
// the fixed PlayerBar/MobileNav overlay reserves that much space regardless
// of whether a track is currently playing. Every page that measures its own
// pixel height for a virtualized list (VirtualTrackList manages its own
// internal scroll rather than growing with the page) needs to subtract this
// so the measured height stays clear of that overlay and doesn't jump when
// playback starts/stops.
export const BOTTOM_RESERVE_PX = 192;
