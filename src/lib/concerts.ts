import type { ApiConcertAlbumItem, ApiConcertItem, ApiConcertSongItem } from "./api";

// Narrows the merged /api/concerts feed down to just the Concert Album
// entries — used anywhere that only knows how to render/link to a real
// Album (e.g. ConcertDetail's horizontal concert switcher), since a
// standalone Concert Song has no detail page of its own.
export function isConcertAlbumItem(item: ApiConcertItem): item is ApiConcertAlbumItem {
  return item.kind === "album";
}

export function isConcertSongItem(item: ApiConcertItem): item is ApiConcertSongItem {
  return item.kind === "song";
}
