import type { Rect } from '../math/droste';

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

export async function loadImageFromUrl(url: string, presetRect?: Rect) {
  imageState.loading = true;
  imageState.error = null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    if (imageState.source?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(imageState.source.url);
    }
    imageState.source = { bitmap, width: bitmap.width, height: bitmap.height, url, presetRect };
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
    if (imageState.source?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(imageState.source.url);
    }
    imageState.source = { bitmap, width: bitmap.width, height: bitmap.height, url };
  } catch (e) {
    imageState.error = e instanceof Error ? e.message : String(e);
  } finally {
    imageState.loading = false;
  }
}
