/**
 * Per-tententoon JPEG thumbnail Blobs in IDB. Keyed by tententoon id.
 * Written by the autosave path (rendered from the saved source), read by
 * the gallery tiles via the in-memory thumbCache.
 */

import { THUMBS_STORE } from './schema';
import { dbAvailable, openTtDb, reqAsPromise, txDone } from './idb';

const RENDER_VERSION = 2;
// Keep the Blob at its original key for compatibility with already-open tabs.
const versionKey = (id: string): IDBValidKey => ['render-version', id];

export async function putThumb(id: string, blob: Blob): Promise<void> {
  if (!dbAvailable()) return;
  const db = await openTtDb();
  try {
    const tx = db.transaction(THUMBS_STORE, 'readwrite');
    tx.objectStore(THUMBS_STORE).put(blob, id);
    tx.objectStore(THUMBS_STORE).put(RENDER_VERSION, versionKey(id));
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function getThumb(id: string): Promise<Blob | null> {
  return (await readThumb(id))?.blob ?? null;
}

export async function readThumb(id: string): Promise<{ blob: Blob; current: boolean } | null> {
  if (!dbAvailable()) return null;
  const db = await openTtDb();
  try {
    const tx = db.transaction(THUMBS_STORE, 'readonly');
    const done = txDone(tx);
    const store = tx.objectStore(THUMBS_STORE);
    const [blob, version] = await Promise.all([
      reqAsPromise(store.get(id)), reqAsPromise(store.get(versionKey(id)))
    ]);
    await done;
    return blob instanceof Blob ? { blob, current: version === RENDER_VERSION } : null;
  } finally {
    db.close();
  }
}

export async function deleteThumb(id: string): Promise<void> {
  if (!dbAvailable()) return;
  const db = await openTtDb();
  try {
    const tx = db.transaction(THUMBS_STORE, 'readwrite');
    tx.objectStore(THUMBS_STORE).delete(id);
    tx.objectStore(THUMBS_STORE).delete(versionKey(id));
    await txDone(tx);
  } finally {
    db.close();
  }
}
