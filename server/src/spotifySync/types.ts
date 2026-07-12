// Overwrite scope for one artist-level Spotify catalog sync — see
// runArtistSpotifySync for exactly what each mode does per field.
export type SpotifySyncMode = "smart" | "force" | "metadata_only" | "albums_only";

export interface SyncLogEntry {
  level: "info" | "skip" | "error";
  message: string;
}

export interface ArtistSyncProgress {
  phase: "albums" | "tracks" | "done";
  done: number;
  total: number;
}

export interface ArtistSyncSummary {
  albumsCreated: number;
  albumsUpdated: number;
  tracksCreated: number;
  tracksUpdated: number;
  fieldsUpdated: number;
  log: SyncLogEntry[];
}
