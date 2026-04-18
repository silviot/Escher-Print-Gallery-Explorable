import type { Rect } from './math/droste';

const IDB_DB = 'droste';
const IDB_STORE = 'uploads';
const IDB_KEY = 'current';
const RECT_PREFIX = 'droste:rect:';
const LAST_KEY = 'droste:last';

export type Identity = { kind: 'url'; url: string } | { kind: 'upload' };

export function identityOf(url: string): Identity {
  return url.startsWith('blob:') ? { kind: 'upload' } : { kind: 'url', url };
}

function identityKey(id: Identity): string {
  return id.kind === 'url' ? `url:${id.url}` : 'upload';
}

export function readRect(id: Identity): Rect | null {
  try {
    const raw = localStorage.getItem(RECT_PREFIX + identityKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      typeof p?.x === 'number' &&
      typeof p?.y === 'number' &&
      typeof p?.w === 'number' &&
      typeof p?.h === 'number'
    ) {
      return p as Rect;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeRect(id: Identity, rect: Rect): void {
  try {
    localStorage.setItem(RECT_PREFIX + identityKey(id), JSON.stringify(rect));
  } catch {}
}

export function readLast(): Identity | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.kind === 'url' && typeof p.url === 'string') return p;
    if (p?.kind === 'upload') return p;
    return null;
  } catch {
    return null;
  }
}

export function writeLast(id: Identity): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(id));
  } catch {}
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUploadBlob(blob: Blob): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadUploadBlob(): Promise<Blob | null> {
  const db = await openDB();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
