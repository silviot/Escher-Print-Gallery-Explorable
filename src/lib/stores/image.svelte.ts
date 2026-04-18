import type { Rect } from '../math/droste';
import {
  loadUploadBlob,
  readLast,
  readRect,
  saveUploadBlob,
  writeLast
} from '../persistence';

export type SourceImage = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  url: string;
  /** Pre-computed self-similar rectangle, if the image is a known Droste. */
  presetRect?: Rect;
};

export const imageState = $state<{ source: SourceImage | null; loading: boolean; error: string | null }>({
  source: null,
  loading: false,
  error: null
});

function revokePrevious() {
  if (imageState.source?.url?.startsWith('blob:')) {
    URL.revokeObjectURL(imageState.source.url);
  }
}

export async function loadImageFromUrl(url: string, presetRect?: Rect) {
  imageState.loading = true;
  imageState.error = null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    revokePrevious();
    imageState.source = { bitmap, width: bitmap.width, height: bitmap.height, url, presetRect };
    writeLast({ kind: 'url', url });
  } catch (e) {
    imageState.error = e instanceof Error ? e.message : String(e);
  } finally {
    imageState.loading = false;
  }
}

export async function loadImageFromFile(file: File) {
  imageState.loading = true;
  imageState.error = null;
  try {
    const bitmap = await createImageBitmap(file);
    const url = URL.createObjectURL(file);
    revokePrevious();
    imageState.source = { bitmap, width: bitmap.width, height: bitmap.height, url };
    try {
      await saveUploadBlob(file);
      writeLast({ kind: 'upload' });
    } catch {
      // IndexedDB unavailable (private mode, etc.) — run without persistence.
    }
  } catch (e) {
    imageState.error = e instanceof Error ? e.message : String(e);
  } finally {
    imageState.loading = false;
  }
}

/** Try to restore the last session (upload blob or URL) from storage. */
export async function restoreLastSession(): Promise<boolean> {
  const last = readLast();
  if (!last) return false;
  const savedRect = readRect(last) ?? undefined;
  if (last.kind === 'upload') {
    try {
      const blob = await loadUploadBlob();
      if (!blob) return false;
      const bitmap = await createImageBitmap(blob);
      const url = URL.createObjectURL(blob);
      revokePrevious();
      imageState.source = {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        url,
        presetRect: savedRect
      };
      return true;
    } catch {
      return false;
    }
  }
  try {
    await loadImageFromUrl(last.url, savedRect);
    return imageState.source?.url === last.url;
  } catch {
    return false;
  }
}
