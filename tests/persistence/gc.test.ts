import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlob, putBlob } from '../../src/lib/ui1/persistence/blobs';
import { gcOrphanBlobs } from '../../src/lib/ui1/persistence/gc';
import { appendUndo } from '../../src/lib/ui1/persistence/undo-log';
import { create, remove } from '../../src/lib/ui1/persistence/tententoons';
import * as idb from '../../src/lib/ui1/persistence/idb';
import { LS_INDEX, stateKey, type TtState } from '../../src/lib/ui1/persistence/schema';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (i: number) => [...values.keys()][i] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};
function state(hash: string): TtState {
  return {
    source: { kind: 'blob', hash }, imageName: 'photo.png',
    rect: { x: 0, y: 0, w: 1, h: 1 }, crop: null,
    playback: { speed: 1, direction: 'in', loopLength: 10, playing: false }, view: 'split'
  };
}
async function resetDb() {
  await idb.reqAsPromise(indexedDB.deleteDatabase('tt-store'));
}
beforeEach(async () => {
  values.clear();
  vi.stubGlobal('localStorage', storage);
  await resetDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await resetDb();
});

describe('source-image cleanup', () => {
  it('reclaims unused images and preserves a source shared by saved entries', async () => {
    const hash = await putBlob(new Blob(['shared']));
    const unused = await putBlob(new Blob(['unused']));
    const first = create(state(hash));
    create(state(hash));
    remove(first.id);
    expect(await gcOrphanBlobs()).toBe(1);
    expect(await (await getBlob(hash))?.text()).toBe('shared');
    expect(await getBlob(unused)).toBeNull();
  });

  it.each(['{broken', '{}', '[null]'])('retains images when the index is unreadable: %s', async (index) => {
    const hash = await putBlob(new Blob(['keep']));
    create(state(hash));
    localStorage.setItem(LS_INDEX, index);
    expect(await gcOrphanBlobs()).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it('retains images when storage access fails', async () => {
    const hash = await putBlob(new Blob(['keep']));
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(await gcOrphanBlobs()).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it('keeps sources referenced by states omitted from the index', async () => {
    const hash = await putBlob(new Blob(['keep']));
    create(state(hash));
    localStorage.removeItem(LS_INDEX);
    expect(await gcOrphanBlobs()).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it.each([null, '{broken', '{}'])('skips cleanup when an indexed state is missing or unreadable: %s', async (saved) => {
    const hash = await putBlob(new Blob(['keep']));
    const entry = create(state(hash));
    if (saved === null) localStorage.removeItem(stateKey(entry.id));
    else localStorage.setItem(stateKey(entry.id), saved);
    expect(await gcOrphanBlobs()).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it('keeps a source still used by an undo snapshot', async () => {
    const hash = await putBlob(new Blob(['old source']));
    await appendUndo('saved-entry', 0, state(hash));
    expect(await gcOrphanBlobs()).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it('observes an import completed while cleanup is waiting to open the database', async () => {
    const open = idb.openTtDb;
    let release!: (db: IDBDatabase) => void;
    vi.spyOn(idb, 'openTtDb').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const cleanup = gcOrphanBlobs();
    const hash = await putBlob(new Blob(['new photo']));
    create(state(hash));
    release(await open());
    expect(await cleanup).toBe(0);
    expect(await getBlob(hash)).not.toBeNull();
  });

  it('refuses to report success when image storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(putBlob(new Blob(['photo']))).rejects.toThrow('storage is unavailable');
    vi.stubGlobal('indexedDB', (await import('fake-indexeddb')).indexedDB);
  });
});
