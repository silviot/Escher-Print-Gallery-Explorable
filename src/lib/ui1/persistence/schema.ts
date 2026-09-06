import type { Rect, Shape, ViewMode } from '../state.svelte';

/**
 * Reference to the source image. URL-backed sources are kept by URL so we
 * never duplicate built-in assets; imports land in IDB `blobs` keyed by
 * content hash so identical imports share one stored Blob.
 */
export type SourceRef =
  | { kind: 'url'; url: string }
  | { kind: 'blob'; hash: string };

/**
 * Per-tententoon persisted state. Kept small so the localStorage write
 * on every gesture-end stays cheap. Image bytes live in IDB `blobs`.
 *
 * The `ui` and `playback.playing` fields are part of the tententoon
 * snapshot because they're how the user last saw THIS image — switching
 * tententoons should restore the view + zoom + play state the user
 * picked for it.
 */
export type TtState = {
  source: SourceRef | null;
  rect: Rect;
  crop: Rect | null;
  /**
   * Frame shape. Optional for backward compat: snapshots written before
   * the shape feature have no field and are read as 'rect'.
   */
  shape?: Shape;
  imageName: string;
  playback: {
    speed: 0.5 | 1 | 2 | 4;
    direction: 'in' | 'out';
    loopLength: number;
    playing: boolean;
  };
  view: ViewMode;
};

export type IndexEntry = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export const TT_DB = 'tt-store';
export const TT_DB_VERSION = 1;
export const BLOBS_STORE = 'blobs';
export const UNDO_STORE = 'undo';
export const THUMBS_STORE = 'thumbs';

export const LS_INDEX = 'tt:index';
export const LS_CURRENT = 'tt:current';
export const LS_STATE_PREFIX = 'tt:state:';

export function stateKey(id: string): string {
  return LS_STATE_PREFIX + id;
}
