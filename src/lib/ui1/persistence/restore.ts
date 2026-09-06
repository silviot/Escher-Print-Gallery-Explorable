import { getBlob, hashBlob, putBlob } from './blobs';
import { readState } from './tententoons';
import type { IndexEntry } from './schema';
import { withoutGpsExif } from './photo-metadata';

export type MissingPhoto = { id: string; hash: string; imageName: string };
export type RestoreProgress = {
  checked: number;
  restoredIds: string[];
  unmatched: number;
  unreadable: number;
};

/** Read each distinct source once, including a byte read to detect broken blobs. */
export async function findMissingPhotos(entries: IndexEntry[]): Promise<MissingPhoto[]> {
  const available = new Map<string, boolean>();
  const missing: MissingPhoto[] = [];
  for (const entry of entries) {
    const state = readState(entry.id);
    if (state?.source?.kind !== 'blob') continue;
    const { hash } = state.source;
    if (!available.has(hash)) {
      try {
        const blob = await getBlob(hash);
        if (!blob?.size) available.set(hash, false);
        else { await blob.slice(0, 1).arrayBuffer(); available.set(hash, true); }
      } catch {
        available.set(hash, false);
      }
    }
    if (!available.get(hash)) missing.push({ id: entry.id, hash, imageName: state.imageName });
  }
  return missing;
}

/** Restore exact matches only; no filename guesses and no changes to saved settings. */
export async function restorePhotos(
  files: Iterable<File> | AsyncIterable<File>,
  missing: MissingPhoto[],
  opts: { onProgress?: (progress: RestoreProgress) => void; signal?: AbortSignal } = {}
): Promise<RestoreProgress> {
  const targets = new Map<string, MissingPhoto[]>();
  for (const photo of missing) targets.set(photo.hash, [...(targets.get(photo.hash) ?? []), photo]);
  const result: RestoreProgress = { checked: 0, restoredIds: [], unmatched: 0, unreadable: 0 };
  for await (const file of files) {
    if (opts.signal?.aborted || targets.size === 0) break;
    result.checked++;
    let candidate: Blob | null = null;
    let hash = '';
    try {
      if (file.size > 20 * 1024 * 1024) {
        result.unmatched++;
      } else {
        const bytes = await file.arrayBuffer();
        candidate = new Blob([bytes], { type: file.type || 'image/jpeg' });
        hash = await hashBlob(candidate);
        if (!targets.has(hash)) {
          const redacted = withoutGpsExif(bytes);
          if (redacted) {
            candidate = new Blob([redacted], { type: file.type || 'image/jpeg' });
            hash = await hashBlob(candidate);
          }
        }
        if (!targets.has(hash)) { candidate = null; result.unmatched++; }
      }
    } catch {
      result.unreadable++;
      candidate = null;
    }
    if (opts.signal?.aborted) break;
    if (candidate && targets.has(hash)) {
      const live = targets.get(hash)!.filter(photo => {
        const source = readState(photo.id)?.source;
        return source?.kind === 'blob' && source.hash === hash;
      });
      if (live.length) {
        // Let quota/storage failures reach the UI; never count them as success.
        await putBlob(candidate);
        result.restoredIds.push(...live.map(photo => photo.id));
      }
      targets.delete(hash);
    }
    opts.onProgress?.({ ...result, restoredIds: [...result.restoredIds] });
    // Give the browser a chance to paint progress/cancel between large files.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return result;
}
