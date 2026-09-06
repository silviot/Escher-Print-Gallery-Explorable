/** Gallery previews generated from saved sources, serialized to limit memory. */
import { putThumb, readThumb, deleteThumb, readState, load } from './persistence';
import { resolveSourceImage } from './source-image';
import { renderThumbnail } from './thumbnail';

export const thumbCache = $state<Record<string, string | null>>({});
const queued = new Set<string>();
const hydrated = new Set<string>();
let draining = false;

export function scheduleThumb(id: string): void {
  queued.add(id);
  if (draining) return;
  draining = true;
  runIdle(() => { void drain(); });
}

async function drain(): Promise<void> {
  try {
    while (queued.size) {
      const id = queued.values().next().value!;
      queued.delete(id);
      try {
        await captureThumb(id);
      } catch (error) {
        // A failed preview must not replace an existing one or reject autosave.
        console.warn('Could not generate gallery preview', error);
      }
    }
  } finally {
    draining = false;
  }
}

async function captureThumb(id: string): Promise<void> {
  const saved = load(id);
  if (!saved) return;
  const { state, entry } = saved;
  const resolved = await resolveSourceImage(state, [state.imageName, entry.name]);
  if (!resolved.image) return;
  let blob: Blob | null;
  try {
    blob = await renderThumbnail(resolved.image, state);
  } finally {
    resolved.image.close();
  }
  if (!blob) return;
  // An edit/delete while decoding must not publish an obsolete preview.
  const current = readState(id);
  if (!current) return;
  if (JSON.stringify(current) !== JSON.stringify(state)) {
    queued.add(id);
    return;
  }
  await putThumb(id, blob);
  if (!readState(id)) { await deleteThumb(id); return; }
  setCacheBlob(id, blob);
}

export async function loadThumbInto(id: string): Promise<void> {
  if (hydrated.has(id)) return;
  hydrated.add(id);
  try {
    const saved = await readThumb(id);
    // A capture may have finished while the read was waiting.
    if (!thumbCache[id]) setCacheBlob(id, saved?.blob ?? null);
    if (!saved?.current) scheduleThumb(id);
  } catch (error) {
    hydrated.delete(id);
    console.warn('Could not load gallery preview', error);
  }
}

export async function dropThumb(id: string): Promise<void> {
  queued.delete(id);
  hydrated.delete(id);
  const prev = thumbCache[id];
  if (prev) URL.revokeObjectURL(prev);
  delete thumbCache[id];
  await deleteThumb(id);
}

function setCacheBlob(id: string, blob: Blob | null): void {
  const prev = thumbCache[id];
  if (prev) URL.revokeObjectURL(prev);
  thumbCache[id] = blob ? URL.createObjectURL(blob) : null;
}

function runIdle(cb: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(cb, { timeout: 1000 });
  } else {
    setTimeout(cb, 200);
  }
}
