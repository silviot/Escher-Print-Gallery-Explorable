/**
 * Content-hashed Blob storage. Imports with identical bytes share one
 * stored Blob — relevant when the user reimports the same image into
 * a new tententoon, or when V5's orphan GC reference-counts blobs.
 *
 * Hash = SHA-256 hex of the file bytes via `crypto.subtle`. Fine for
 * the file sizes the editor accepts (≤20 MB per ui1/file.ts).
 */

import { BLOBS_STORE } from './schema';
import { dbAvailable, openTtDb, reqAsPromise, txDone } from './idb';

export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Put a Blob keyed by its content hash. Returns the hash. */
export async function putBlob(blob: Blob): Promise<string> {
  const hash = await hashBlob(blob);
  if (!dbAvailable()) throw new Error('Image storage is unavailable in this browser.');
  const db = await openTtDb();
  try {
    const tx = db.transaction(BLOBS_STORE, 'readwrite', { durability: 'strict' });
    tx.objectStore(BLOBS_STORE).put(blob, hash);
    await txDone(tx);
    return hash;
  } finally {
    db.close();
  }
}

export async function getBlob(hash: string): Promise<Blob | null> {
  if (!dbAvailable()) return null;
  const db = await openTtDb();
  try {
    const tx = db.transaction(BLOBS_STORE, 'readonly');
    const req = tx.objectStore(BLOBS_STORE).get(hash);
    const blob = (await reqAsPromise(req)) as Blob | undefined;
    await txDone(tx);
    return blob ?? null;
  } finally {
    db.close();
  }
}
