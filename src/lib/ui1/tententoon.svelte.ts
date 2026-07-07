/**
 * Currently-open tententoon. A thin store ({id, name}) plus a small
 * autosave engine that snapshots `doc` + `playback` into the
 * persistence layer on gesture-end.
 *
 * Gesture-end is signalled explicitly via `markGestureEnd()` — called
 * from CanvasStage's onPointerUp and from setImage flows. We don't
 * watch `doc.rect` reactively because we'd write on every pointermove;
 * the existing commit helpers already debounce gestures to pointerup.
 *
 * Loading a tententoon (load()) sets a `hydrating` flag so any writes
 * that race in from the loading code are suppressed.
 */

import { doc, playback, ui, setImage, snapShapeMorph } from './state.svelte';
import * as persistence from './persistence';
import type { SourceRef, TtState, IndexEntry } from './persistence';
import {
  pushUndo,
  resetUndo,
  hydrateUndo,
  clearUndo,
  isApplying,
  canUndo,
  canRedo,
  undo as undoStep,
  redo as redoStep
} from './undo.svelte';
import { scheduleThumb, dropThumb } from './thumb.svelte';

export const currentTententoon = $state<{
  id: string | null;
  name: string;
  hydrating: boolean;
}>({
  id: null,
  name: '',
  hydrating: false
});

function snapshotState(source: SourceRef | null): TtState {
  return {
    source,
    rect: { x: doc.rect.x, y: doc.rect.y, w: doc.rect.w, h: doc.rect.h },
    crop: doc.crop ? { x: doc.crop.x, y: doc.crop.y, w: doc.crop.w, h: doc.crop.h } : null,
    shape: doc.shape,
    imageName: doc.imageName,
    playback: {
      speed: playback.speed,
      direction: playback.direction,
      loopLength: playback.loopLength,
      playing: playback.playing
    },
    view: ui.view
  };
}

let knownSource: SourceRef | null = null;

/** Replace the in-memory record of which source the current tententoon points at. */
export function setKnownSource(s: SourceRef | null): void {
  knownSource = s;
}

/**
 * Take a snapshot of the current editor state and write it to the
 * persistence layer under the current tententoon's id. Also pushes a
 * new undo step — unless the write is the result of applying a
 * historical snapshot (the undo engine sets isApplying then).
 *
 * No-op if there's no current tententoon yet (stray pointerup before
 * any source load) — source loads call markCreate() explicitly.
 */
export function markGestureEnd(): void {
  if (currentTententoon.hydrating) return;
  const state = snapshotState(knownSource);
  if (!currentTententoon.id) return;
  const id = currentTententoon.id;
  persistence.writeState(id, state);
  if (isApplying.value) return;
  const r = pushUndo(state);
  if (!r.pushed) return;
  // Mirror the in-memory mutation to IDB so undo survives reload.
  // Awaited fire-and-forget — local writes are fast and ordering with
  // the next gesture-end is naturally serial via the IDB transactions.
  void persistence.appendUndo(id, r.newSeq, state);
  if (r.droppedFromTail.length > 0) {
    void persistence.truncateRedoTail(id, r.droppedFromTail[0]);
  }
  if (r.droppedFromHead.length > 0) {
    const lastDropped = r.droppedFromHead[r.droppedFromHead.length - 1];
    void persistence.trimUndo(id, lastDropped + 1);
  }
  // Fire-and-forget thumbnail capture, scheduled on idle.
  scheduleThumb(id);
}

/**
 * Create a tententoon for a freshly-loaded source. The caller (TopBar /
 * DropZone) has already called setImage(); we then snapshot the current
 * doc + the new source and persist.
 */
export function markCreate(source: SourceRef): IndexEntry {
  knownSource = source;
  const state = snapshotState(source);
  const entry = persistence.create(state);
  currentTententoon.id = entry.id;
  currentTententoon.name = entry.name;
  resetUndo(state);
  // Persist the baseline so reload can hydrate the stack even before
  // the user makes any edits.
  void persistence.appendUndo(entry.id, 0, state);
  return entry;
}

/**
 * "Fill" the current tententoon's source if it's a fresh `null`-source
 * entry; otherwise create a new tententoon. Used by DropZone after a
 * user clicked "New" in the gallery — the empty entry exists, the next
 * upload should land in it, not stack a second one.
 */
export function markSourceLoaded(source: SourceRef): IndexEntry {
  if (currentTententoon.id && knownSource === null) {
    knownSource = source;
    const state = snapshotState(source);
    const id = currentTententoon.id;
    persistence.writeState(id, state);
    // Filling an empty tententoon is the first "real" state — undo
    // back to here, not to the source-less baseline. Drop the prior
    // (source: null) IDB undo log and persist the new baseline.
    resetUndo(state);
    void (async () => {
      await persistence.dropUndo(id);
      await persistence.appendUndo(id, 0, state);
    })();
    return {
      id,
      name: currentTententoon.name,
      createdAt: 0,
      updatedAt: Date.now()
    };
  }
  return markCreate(source);
}

/**
 * Create an empty tententoon (no source). Used by the gallery's "New"
 * button. Sets it as current so the editor renders the empty state and
 * the next upload fills the entry in place.
 */
export function createEmpty(): IndexEntry {
  knownSource = null;
  setImage(null, '');
  const state = snapshotState(null);
  const entry = persistence.create(state, 'Untitled · ' + nowStamp());
  currentTententoon.id = entry.id;
  currentTententoon.name = entry.name;
  resetUndo(state);
  void persistence.appendUndo(entry.id, 0, state);
  return entry;
}

function nowStamp(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0') +
    ' ' +
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

/** Rename the current or any tententoon. Updates the live store if it's current. */
export function renameTententoon(id: string, name: string): void {
  persistence.rename(id, name);
  if (currentTententoon.id === id) currentTententoon.name = name;
}

/**
 * Delete a tententoon. If it was the current one, the editor returns
 * to its empty state — image cleared, currentTententoon zeroed,
 * `tt:current` cleared by persistence.remove(), undo stack wiped.
 */
export function deleteTententoon(id: string): void {
  const wasCurrent = currentTententoon.id === id;
  persistence.remove(id);
  // Fire-and-forget cleanup of the per-id IDB rows plus a sweep for
  // orphaned blobs. Synchronous remove() already cleared the
  // localStorage entries so gcOrphanBlobs sees the post-delete refs.
  void (async () => {
    await persistence.dropUndo(id);
    await dropThumb(id);
    await persistence.gcOrphanBlobs();
  })();
  if (wasCurrent) {
    currentTententoon.hydrating = true;
    try {
      setImage(null, '');
      knownSource = null;
      currentTententoon.id = null;
      currentTententoon.name = '';
      clearUndo();
    } finally {
      currentTententoon.hydrating = false;
    }
  }
}

/**
 * Move one step back in the current tententoon's undo stack and apply
 * the snapshot. Also writes the resulting state to localStorage so
 * reload reflects the undone state (V4 doesn't persist the undo log
 * itself — V5 does).
 */
export function performUndo(): void {
  if (!canUndo() || !currentTententoon.id) return;
  undoStep();
  const id = currentTententoon.id;
  persistence.writeState(id, snapshotState(knownSource));
  scheduleThumb(id);
}

/** Symmetric to performUndo. */
export function performRedo(): void {
  if (!canRedo() || !currentTententoon.id) return;
  redoStep();
  const id = currentTententoon.id;
  persistence.writeState(id, snapshotState(knownSource));
  scheduleThumb(id);
}

export { canUndo, canRedo } from './undo.svelte';

type ResolvedSource = {
  image: ImageBitmap | null;
  source: SourceRef | null;
  missingRequiredSource: boolean;
};

async function decodeImage(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

async function resolveSourceImage(state: TtState, names: string[]): Promise<ResolvedSource> {
  if (state.source?.kind === 'url') {
    try {
      const res = await fetch(state.source.url);
      if (!res.ok) {
        return { image: null, source: state.source, missingRequiredSource: true };
      }
      const image = await decodeImage(await res.blob());
      return {
        image,
        source: state.source,
        missingRequiredSource: image === null
      };
    } catch {
      return { image: null, source: state.source, missingRequiredSource: true };
    }
  }

  if (state.source?.kind === 'blob') {
    let blob = await persistence.getBlob(state.source.hash);
    let source: SourceRef = state.source;
    if (!blob) {
      const recovered = await persistence.recoverSourceBlob(state.source, names);
      if (recovered) {
        blob = recovered.blob;
        source = recovered.source;
      }
    }
    const image = blob ? await decodeImage(blob) : null;
    return {
      image,
      source,
      missingRequiredSource: image === null
    };
  }

  const recovered = await persistence.recoverSourceBlob(null, names);
  if (recovered) {
    const image = await decodeImage(recovered.blob);
    if (image) {
      return { image, source: recovered.source, missingRequiredSource: false };
    }
  }
  return { image: null, source: null, missingRequiredSource: false };
}

/**
 * Load a tententoon by id. Resolves the source (URL or IDB blob), calls
 * setImage to update the editor, then writes rect/crop/playback from the
 * snapshot. The hydrating flag suppresses autosave writes during this.
 *
 * Returns false on missing/corrupt entries so the caller can fall
 * through to the empty state.
 */
export async function load(id: string): Promise<boolean> {
  const loaded = persistence.load(id);
  if (!loaded) return false;
  const { entry, state } = loaded;
  currentTententoon.hydrating = true;
  try {
    const resolved = await resolveSourceImage(state, [state.imageName, entry.name]);
    if (resolved.missingRequiredSource) return false;
    const hydratedState: TtState =
      resolved.source === state.source ? state : { ...state, source: resolved.source };
    if (hydratedState !== state) persistence.writeState(entry.id, hydratedState);
    // setImage clears rect/crop/playback, so apply the snapshot AFTER.
    setImage(resolved.image, hydratedState.imageName);
    doc.rect = { ...hydratedState.rect };
    doc.crop = hydratedState.crop ? { ...hydratedState.crop } : null;
    doc.shape = hydratedState.shape ?? 'rect';
    snapShapeMorph(); // loading a tententoon jumps to its shape, no morph
    playback.speed = hydratedState.playback.speed;
    playback.direction = hydratedState.playback.direction;
    playback.loopLength = hydratedState.playback.loopLength;
    // Resume the user's saved play state. Falls back to autoplay-if-rect
    // for older snapshots that predate persisting `playing`.
    playback.playing =
      typeof hydratedState.playback.playing === 'boolean'
        ? hydratedState.playback.playing
        : hydratedState.rect.w > 0 && hydratedState.rect.h > 0;
    playback.t = 0;
    ui.view = hydratedState.view ?? 'split';
    knownSource = hydratedState.source;
    currentTententoon.id = entry.id;
    currentTententoon.name = entry.name;
    persistence.setCurrentId(entry.id);
    // Hydrate the in-memory undo stack from IDB so ⌘Z survives reload.
    // Pointer is positioned to match the on-disk state (the user may
    // have undone before reloading); if no entry matches, hydrateUndo
    // falls back to the head.
    const rows = await persistence.readUndo(entry.id);
    hydrateUndo(rows, hydratedState);
    return true;
  } finally {
    currentTententoon.hydrating = false;
  }
}

/**
 * Boot: if `tt:current` resolves to a usable entry, hydrate it.
 * Otherwise leave the editor empty (DropZone shows).
 */
export async function bootRestore(): Promise<boolean> {
  const id = persistence.getCurrentId();
  if (!id) return false;
  const ok = await load(id);
  if (!ok) persistence.setCurrentId(null);
  return ok;
}
