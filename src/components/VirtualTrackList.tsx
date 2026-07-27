import { List, type RowComponentProps } from "react-window";
import type { ApiTrack } from "../lib/api";
import TrackRow from "./TrackRow";

interface RowData {
  tracks: ApiTrack[];
  queue: ApiTrack[];
  showAlbumTitle?: boolean;
  showActions?: boolean;
  showArtistName?: boolean;
  showPlayCount?: boolean;
}

function Row({ index, style, tracks, queue, showAlbumTitle, showActions, showArtistName, showPlayCount }: RowComponentProps<RowData>) {
  const track = tracks[index];
  return (
    <div style={style}>
      <TrackRow
        track={track}
        index={index + 1}
        queue={queue}
        showAlbumTitle={showAlbumTitle}
        showActions={showActions}
        showArtistName={showArtistName}
        showPlayCount={showPlayCount}
      />
    </div>
  );
}

interface VirtualTrackListProps {
  tracks: ApiTrack[];
  queue: ApiTrack[];
  height: number;
  showAlbumTitle?: boolean;
  showActions?: boolean;
  showArtistName?: boolean;
  showPlayCount?: boolean;
}

// TrackRow's rendered height: py-2 (8px top + 8px bottom) around a 48px
// (size="sm") CoverArt — matches the sm CoverArt row used by every list
// this component wraps.
const ROW_HEIGHT = 64;

// Windows a long track list so only the rows actually on screen (plus a
// small overscan) are ever mounted — without this, a catalog of thousands
// of songs means thousands of live CoverArt/img elements and event
// listeners at once, which is what turns "scroll the Songs page" into
// dropped frames. `height` is measured by the caller (see AllSongs.tsx)
// since this list owns its own internal scroll region rather than
// relying on the page's outer scroll.
export default function VirtualTrackList({
  tracks,
  queue,
  height,
  showAlbumTitle,
  showActions,
  showArtistName,
  showPlayCount,
}: VirtualTrackListProps) {
  return (
    <List
      rowComponent={Row}
      rowCount={tracks.length}
      rowHeight={ROW_HEIGHT}
      rowProps={{ tracks, queue, showAlbumTitle, showActions, showArtistName, showPlayCount }}
      overscanCount={6}
      style={{ height }}
      className="no-scrollbar"
    />
  );
}
