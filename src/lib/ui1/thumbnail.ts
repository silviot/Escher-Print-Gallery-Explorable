import type { TtState } from './persistence';
import { CpuEscherZoomRenderer } from '../render/escher-zoom/cpu';
import { buildRenderInputs, extractPixels } from './render';

/** Render from a saved image/state, independent of the live WebGL buffer. */
export async function renderThumbnail(image: ImageBitmap, state: TtState): Promise<Blob | null> {
  const width = 240;
  const height = 180;
  const frame = state.crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  const scale = Math.min(width / frame.w, height / frame.h);
  const w = Math.max(1, Math.round(frame.w * scale));
  const h = Math.max(1, Math.round(frame.h * scale));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (state.crop && state.rect.w > 0 && state.rect.h > 0) {
    const input = buildRenderInputs(extractPixels(image), state.rect, state.crop, w, h);
    if (!input) return null;
    // Use the saved shape, never the editor's live morph or play position.
    input.ctx.shapeMorph = state.shape === 'ellipse' ? 1 : 0;
    input.t = 0;
    const rendered = document.createElement('canvas');
    const renderer = new CpuEscherZoomRenderer();
    try {
      renderer.init(rendered);
      await renderer.renderProgressive(input);
      ctx.drawImage(rendered, x, y, w, h);
    } finally {
      renderer.dispose();
    }
  } else {
    // An imported photo has no rectangle yet, but still deserves a preview.
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x, y, w, h);
  }
  return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.7));
}
