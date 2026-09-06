/**
 * IDB opener for the tententoon store. Separate database from the
 * existing `tententoon`/`history` recent-images store (lib/ui1/history.svelte.ts)
 * so the two systems version independently and don't collide.
 *
 * Stores created here: `blobs` (imported image Blobs keyed by content
 * hash), `undo` (per-tententoon snapshot log — empty in V1, populated
 * in V5), `thumbs` (gallery thumbnails — empty in V1, populated in V5).
 */

import {
  TT_DB,
  TT_DB_VERSION,
  BLOBS_STORE,
  UNDO_STORE,
  THUMBS_STORE
} from './schema';

export function dbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openTtDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TT_DB, TT_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
      if (!db.objectStoreNames.contains(UNDO_STORE)) {
        const undo = db.createObjectStore(UNDO_STORE, { keyPath: ['id', 'seq'] });
        undo.createIndex('byId', 'id');
      }
      if (!db.objectStoreNames.contains(THUMBS_STORE)) {
        db.createObjectStore(THUMBS_STORE);
      }
    };
  });
}

export function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
