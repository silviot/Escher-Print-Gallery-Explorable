import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobs from '../../src/lib/ui1/persistence/blobs';
import { findMissingPhotos, restorePhotos } from '../../src/lib/ui1/persistence/restore';
import { withoutGpsExif } from '../../src/lib/ui1/persistence/photo-metadata';
import { create, list, readState, remove, writeState, getCurrentId } from '../../src/lib/ui1/persistence/tententoons';
import { reqAsPromise, openTtDb, txDone } from '../../src/lib/ui1/persistence/idb';
import type { TtState } from '../../src/lib/ui1/persistence/schema';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};
function state(hash: string): TtState {
  return { source: { kind: 'blob', hash }, imageName: 'same-name.jpg',
    rect: { x: 50, y: 20, w: 10, h: 10 }, crop: { x: 5, y: 0, w: 100, h: 100 }, shape: 'ellipse',
    playback: { speed: 2, direction: 'out', loopLength: 9, playing: false }, view: 'droste' };
}
const photo = (text: string, name = 'same-name.jpg') => new File([text], name, { type: 'image/jpeg' });

// A tiny JPEG header with EXIF orientation plus inline/out-of-line GPS values.
// It tests byte-level matching; decoding/rendering is covered in browser checks.
function jpegWithGps(little = true): { original: ArrayBuffer; picker: ArrayBuffer } {
  const original = new ArrayBuffer(104);
  const bytes = new Uint8Array(original), view = new DataView(original);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0, 98, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  const base = 12;
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], base);
  const u16 = (p: number, n: number) => view.setUint16(base + p, n, little);
  const u32 = (p: number, n: number) => view.setUint32(base + p, n, little);
  u16(2, 42); u32(4, 8); u16(8, 2);
  u16(10, 0x112); u16(12, 3); u32(14, 1); u16(18, 6); // orientation
  u16(22, 0x8825); u16(24, 4); u32(26, 1); u32(30, 38);
  u16(38, 2);
  u16(40, 1); u16(42, 2); u32(44, 2); bytes[base + 48] = 78;
  u16(52, 2); u16(54, 5); u32(56, 3); u32(60, 66);
  bytes.fill(7, base + 66, base + 90);
  bytes.set([0xff, 0xd9], 102);
  const picker = original.slice(0), redacted = new Uint8Array(picker);
  redacted.fill(0, base + 48, base + 50); redacted.fill(0, base + 66, base + 90);
  return { original, picker };
}

beforeEach(async () => { values.clear(); vi.stubGlobal('localStorage', storage); await reqAsPromise(indexedDB.deleteDatabase('tt-store')); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await reqAsPromise(indexedDB.deleteDatabase('tt-store')); });

describe('restore missing photos', () => {
  it('finds missing sources while leaving available and sample sources alone', async () => {
    const present = await blobs.putBlob(photo('present'));
    const kept = create(state(present)); const missing = create(state('missing'));
    create({ ...state('unused'), source: { kind: 'url', url: '/sample.jpg' } });
    const result = await findMissingPhotos(list());
    expect(result.map(r => r.id)).toEqual([missing.id]);
    expect(readState(kept.id)?.source).toEqual({ kind: 'blob', hash: present });
  });

  it('restores all tententoons sharing a matching photo without touching settings or current selection', async () => {
    const file = photo('exact image bytes', 'renamed.jpg'), hash = await blobs.hashBlob(file);
    const a = create(state(hash)); const b = create(state(hash));
    const before = new Map(values), current = getCurrentId();
    const result = await restorePhotos([file], await findMissingPhotos(list()));
    expect(new Set(result.restoredIds)).toEqual(new Set([a.id, b.id]));
    expect(await (await blobs.getBlob(hash))?.text()).toBe('exact image bytes');
    expect(values).toEqual(before); expect(getCurrentId()).toBe(current);
    expect(await findMissingPhotos(list())).toEqual([]);
  });

  it('does not match a different photo with the same filename or save unmatched files', async () => {
    const wanted = photo('wanted'); const hash = await blobs.hashBlob(wanted); create(state(hash));
    const wrong = photo('unrelated');
    const result = await restorePhotos([wrong], await findMissingPhotos(list()));
    expect(result.restoredIds).toEqual([]); expect(result.unmatched).toBe(1);
    expect(await blobs.getBlob(hash)).toBeNull(); expect(await blobs.getBlob(await blobs.hashBlob(wrong))).toBeNull();
  });

  it.each([true, false])('matches Android picker bytes from a camera original (little endian: %s)', async little => {
    const { original, picker } = jpegWithGps(little);
    const hash = await blobs.hashBlob(new Blob([picker])); const entry = create(state(hash));
    const result = await restorePhotos([new File([original], 'camera.jpg', { type: 'image/jpeg' })], await findMissingPhotos(list()));
    expect(result.restoredIds).toEqual([entry.id]);
    expect(new Uint8Array(await (await blobs.getBlob(hash))!.arrayBuffer())).toEqual(new Uint8Array(picker));
    expect(new Uint8Array(original)[60]).not.toBe(0); // original remains untouched
  });

  it('does not overwrite a record deleted while the folder scan is running', async () => {
    const file = photo('photo'), hash = await blobs.hashBlob(file); const entry = create(state(hash));
    const missing = await findMissingPhotos(list());
    async function* files() { remove(entry.id); yield file; }
    expect((await restorePhotos(files(), missing)).restoredIds).toEqual([]);
    expect(await blobs.getBlob(hash)).toBeNull();
  });

  it('reports a storage failure instead of claiming a restore succeeded', async () => {
    const file = photo('photo'), hash = await blobs.hashBlob(file); create(state(hash));
    const missing = await findMissingPhotos(list()), progress = vi.fn();
    vi.spyOn(blobs, 'putBlob').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(restorePhotos([file], missing, { onProgress: progress })).rejects.toThrow('Full');
    expect(progress).not.toHaveBeenCalled();
  });

  it('allows stopping a batch after completed restores without saving later files', async () => {
    const a = photo('first'), b = photo('second'); const ah = await blobs.hashBlob(a), bh = await blobs.hashBlob(b);
    create(state(ah)); create(state(bh)); const controller = new AbortController();
    const result = await restorePhotos([a, b], await findMissingPhotos(list()), { signal: controller.signal, onProgress: () => controller.abort() });
    expect(result.restoredIds).toHaveLength(1); expect(await blobs.getBlob(ah)).not.toBeNull(); expect(await blobs.getBlob(bh)).toBeNull();
  });

  it('detects an empty source blob as needing restoration', async () => {
    const db = await openTtDb(); const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put(new Blob([]), 'empty'); await txDone(tx); db.close();
    const entry = create(state('empty')); expect((await findMissingPhotos(list())).map(r => r.id)).toEqual([entry.id]);
  });
});

describe('metadata normalization', () => {
  it('leaves non-JPEG and malformed inputs unmatched', () => {
    expect(withoutGpsExif(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    const { original } = jpegWithGps(); const broken = original.slice(0, 40);
    expect(withoutGpsExif(broken)).toBeNull();
  });
});

describe('gallery order', () => {
  it('keeps the newest-created tententoons first after edits', () => {
    const clock = vi.spyOn(Date, 'now'); clock.mockReturnValue(1000); const older = create(state('one'), 'Older');
    clock.mockReturnValue(2000); const newer = create(state('two'), 'Newer');
    clock.mockReturnValue(3000); writeState(older.id, { ...state('one'), shape: 'rect' });
    expect(list().map(e => e.id)).toEqual([newer.id, older.id]);
    expect(list()[1].updatedAt).toBe(3000);
  });
});
