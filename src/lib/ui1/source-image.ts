import * as persistence from './persistence';
import type { SourceRef, TtState } from './persistence';

export type ResolvedSource = {
  image: ImageBitmap | null;
  source: SourceRef | null;
  missingRequiredSource: boolean;
};

async function decodeImage(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export async function resolveSourceImage(state: TtState, names: string[]): Promise<ResolvedSource> {
  if (state.source?.kind === 'url') {
    try {
      const res = await fetch(state.source.url);
      if (!res.ok) {
        return { image: null, source: state.source, missingRequiredSource: true };
      }
      const image = await decodeImage(await res.blob());
      return {
        image,
        source: state.source,
        missingRequiredSource: image === null
      };
    } catch {
      return { image: null, source: state.source, missingRequiredSource: true };
    }
  }

  if (state.source?.kind === 'blob') {
    let blob = await persistence.getBlob(state.source.hash);
    let source: SourceRef = state.source;
    if (!blob) {
      const recovered = await persistence.recoverSourceBlob(state.source, names);
      if (recovered) {
        blob = recovered.blob;
        source = recovered.source;
      }
    }
    const image = blob ? await decodeImage(blob) : null;
    return {
      image,
      source,
      missingRequiredSource: image === null
    };
  }

  const recovered = await persistence.recoverSourceBlob(null, names);
  if (recovered) {
    const image = await decodeImage(recovered.blob);
    if (image) {
      return { image, source: recovered.source, missingRequiredSource: false };
    }
  }
  return { image: null, source: null, missingRequiredSource: false };
}
