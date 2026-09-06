/**
 * Reclaim unreferenced images only after taking the IDB write lock. Imports
 * write their blob before publishing the localStorage reference, so a scan
 * taken before the transaction can become stale while it waits for a writer.
 * If any saved metadata cannot be read, retain the image bytes.
 */
import { BLOBS_STORE, UNDO_STORE, LS_INDEX, LS_STATE_PREFIX, stateKey } from './schema';
import type { TtState } from './schema';
import { dbAvailable, openTtDb, reqAsPromise, txDone } from './idb';

function addSource(refs: Set<string>, state: TtState): void {
  if (!state || typeof state !== 'object' || !('source' in state)) {
    throw new Error('Unreadable saved state');
  }
  if (state.source === null) return;
  if (state.source.kind === 'blob' && typeof state.source.hash === 'string') {
    refs.add(state.source.hash);
  } else if (state.source.kind !== 'url' || typeof state.source.url !== 'string') {
    throw new Error('Unreadable saved source');
  }
}

function referencedHashes(): Set<string> | null {
  try {
    const refs = new Set<string>();
    const raw = localStorage.getItem(LS_INDEX);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return null;
    const keys = new Set<string>();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string') return null;
      keys.add(stateKey(entry.id));
    }
    // Keep states omitted by a partial/stale index, including another tab's.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS_STATE_PREFIX)) keys.add(key);
    }
    for (const key of keys) {
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      addSource(refs, JSON.parse(saved));
    }
    return refs;
  } catch {
    return null;
  }
}

export async function gcOrphanBlobs(): Promise<number> {
  if (!dbAvailable()) return 0;
  const db = await openTtDb();
  try {
    const tx = db.transaction([BLOBS_STORE, UNDO_STORE], 'readwrite');
    const done = txDone(tx);
    try {
      const store = tx.objectStore(BLOBS_STORE);
      const [keys, undo] = await Promise.all([
        reqAsPromise(store.getAllKeys()),
        reqAsPromise(tx.objectStore(UNDO_STORE).getAll())
      ]);
      const refs = referencedHashes();
      if (!refs) { await done; return 0; }
      // Undo can still need a source that the current snapshot doesn't use.
      try {
        for (const row of undo) addSource(refs, row.state);
      } catch {
        await done;
        return 0;
      }
      let dropped = 0;
      for (const key of keys) {
        if (typeof key !== 'string' || refs.has(key)) continue;
        store.delete(key);
        dropped++;
      }
      await done;
      return dropped;
    } catch (error) {
      await done.catch(() => {});
      throw error;
    }
  } finally {
    db.close();
  }
}
