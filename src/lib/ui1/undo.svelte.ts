/**
 * In-memory per-tententoon undo/redo stack. V4 keeps it session-only;
 * V5 persists snapshots to IDB so undo survives reload.
 *
 * Model: every successful gesture (drag end, view toggle, play/pause
 * toggle, direction toggle) pushes a snapshot. Undo moves a pointer
 * back; redo moves it forward. A new push after an undo truncates the
 * redo tail (standard editor behaviour — R13).
 *
 * `applySnapshot` writes a snapshot back into the live editor stores
 * (doc, playback, ui). It sets `isApplying = true` while it works so
 * the autosave engine in tententoon.svelte.ts can suppress its own
 * pushUndo() — applying a historical state must not record itself as
 * a fresh history step.
 */

import { doc } from './state.svelte';
import type { TtState } from './persistence';

/**
 * Maximum entries kept in the per-tententoon stack (and in IDB).
 * Each snapshot is tiny — rect+crop+a handful of scalars — but a
 * cap keeps long sessions from accumulating thousands.
 */
export const MAX_DEPTH = 100;

export const undoState = $state<{
  stack: TtState[];
  /** Parallel to stack — IDB seq numbers. Used to identify which rows to truncate / trim. */
  seqs: number[];
  pointer: number;
}>({
  stack: [],
  seqs: [],
  pointer: -1
});

/**
 * Outcome of a pushUndo call. Tells the persistence orchestration
 * which seqs to write, drop from the redo tail (after an undo +
 * fresh edit), and drop from the head (depth cap). When `pushed`
 * is false, nothing changed and no IDB writes are needed.
 */
export type PushResult =
  | { pushed: false }
  | {
      pushed: true;
      newSeq: number;
      droppedFromTail: number[];
      droppedFromHead: number[];
    };

/**
 * Suppresses pushUndo while a snapshot is being applied. Read by
 * tententoon.svelte's autosave path — must not be reset until the
 * caller's writes have completed.
 */
export let isApplying = $state({ value: false });

export function canUndo(): boolean {
  return undoState.pointer > 0;
}
export function canRedo(): boolean {
  return undoState.pointer >= 0 && undoState.pointer < undoState.stack.length - 1;
}

/** Reset the stack to a single-entry baseline. Called on tententoon switch. */
export function resetUndo(baseline: TtState): void {
  undoState.stack = [cloneState(baseline)];
  undoState.seqs = [0];
  undoState.pointer = 0;
}

/**
 * Hydrate from a persisted undo log (IDB rows ordered by seq) and
 * position the pointer to match the current on-disk state. If no
 * row matches, fall back to the head — undo from the head still
 * works (walks back through history) at the cost of "redo" being
 * unavailable until the user makes a new edit.
 */
export function hydrateUndo(
  rows: { seq: number; state: TtState }[],
  currentState: TtState
): void {
  if (rows.length === 0) {
    resetUndo(currentState);
    return;
  }
  undoState.stack = rows.map((r) => cloneState(r.state));
  undoState.seqs = rows.map((r) => r.seq);
  let matchIdx = -1;
  for (let i = undoState.stack.length - 1; i >= 0; i--) {
    if (rectsEqual(undoState.stack[i], currentState)) {
      matchIdx = i;
      break;
    }
  }
  undoState.pointer = matchIdx >= 0 ? matchIdx : undoState.stack.length - 1;
}

/** Clear the stack entirely. Used when the editor returns to its empty state. */
export function clearUndo(): void {
  undoState.stack = [];
  undoState.seqs = [];
  undoState.pointer = -1;
}

/**
 * Append a new state to the stack — but only if its rect/crop differ
 * from the current head. Undo is scoped to rectangle edits: changing
 * view, play state, direction, or loop length still autosaves to
 * disk via the caller's writeState but does not create an undo step.
 *
 * If the pointer was anywhere but the head (user had undone some
 * steps), the redo tail is dropped before the append — once a new
 * edit lands, the alternate future is gone (R13). Enforces MAX_DEPTH
 * by shifting from the head.
 *
 * Returns the IDB sync hints — which seqs to write, drop from tail,
 * and drop from head — so the persistence orchestration can mirror
 * the in-memory state to IDB without re-walking the stack.
 */
export function pushUndo(next: TtState): PushResult {
  if (isApplying.value) return { pushed: false };
  const head = undoState.stack[undoState.stack.length - 1];
  if (head && rectsEqual(head, next)) return { pushed: false };

  let droppedFromTail: number[] = [];
  if (undoState.pointer < undoState.stack.length - 1) {
    const cut = undoState.pointer + 1;
    droppedFromTail = undoState.seqs.slice(cut);
    undoState.stack = undoState.stack.slice(0, cut);
    undoState.seqs = undoState.seqs.slice(0, cut);
  }

  const newSeq =
    undoState.seqs.length > 0 ? undoState.seqs[undoState.seqs.length - 1] + 1 : 0;
  undoState.stack = [...undoState.stack, cloneState(next)];
  undoState.seqs = [...undoState.seqs, newSeq];
  undoState.pointer = undoState.stack.length - 1;

  const droppedFromHead: number[] = [];
  while (undoState.stack.length > MAX_DEPTH) {
    droppedFromHead.push(undoState.seqs[0]);
    undoState.stack = undoState.stack.slice(1);
    undoState.seqs = undoState.seqs.slice(1);
    undoState.pointer -= 1;
  }

  return { pushed: true, newSeq, droppedFromTail, droppedFromHead };
}

/** Move pointer back one step and apply the snapshot. No-op if can't. */
export function undo(): void {
  if (!canUndo()) return;
  undoState.pointer -= 1;
  applySnapshot(undoState.stack[undoState.pointer]);
}

/** Move pointer forward one step and apply the snapshot. No-op if can't. */
export function redo(): void {
  if (!canRedo()) return;
  undoState.pointer += 1;
  applySnapshot(undoState.stack[undoState.pointer]);
}

/**
 * Write a snapshot back into the live editor stores. Restores only
 * the *document* fields (rect, crop) — view mode, play state,
 * direction, and loopLength are session/UI concerns, not part of
 * the rectangle-edit history the user expects ⌘Z to walk. They
 * still autosave to disk, just outside the undo timeline.
 *
 * Wraps the writes in `isApplying = true` so the autosave engine
 * skips its pushUndo() for the resulting state changes. The flag is
 * cleared in a microtask so any synchronous reactive effects fired
 * by the writes still see it as true.
 */
export function applySnapshot(snap: TtState): void {
  isApplying.value = true;
  try {
    doc.rect = { ...snap.rect };
    doc.crop = snap.crop ? { ...snap.crop } : null;
    doc.shape = snap.shape ?? 'rect';
  } finally {
    queueMicrotask(() => {
      isApplying.value = false;
    });
  }
}

function cloneState(s: TtState): TtState {
  return {
    source: s.source ? { ...s.source } : null,
    rect: { ...s.rect },
    crop: s.crop ? { ...s.crop } : null,
    shape: s.shape ?? 'rect',
    imageName: s.imageName,
    playback: { ...s.playback },
    view: s.view
  } as TtState;
}

/** Rect + crop equality — the only fields the undo timeline tracks. */
function rectsEqual(a: TtState, b: TtState): boolean {
  return (
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.w === b.rect.w &&
    a.rect.h === b.rect.h &&
    (a.shape ?? 'rect') === (b.shape ?? 'rect') &&
    cropEq(a.crop, b.crop)
  );
}

function cropEq(a: TtState['crop'], b: TtState['crop']): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
