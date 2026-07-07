/**
 * Driver that bridges /ui1's runes (doc.rect, playback.t, …) to the
 * existing complex-map GPU spiral renderer (createEscherZoomRenderer).
 *
 * We use the existing pipeline rather than the simpler nested-drawImage
 * model from HANDOFF §4 because:
 *   (a) it's already GPU-accelerated in a worker (smooth playback),
 *   (b) it produces the canonical Lenstra spiral the rest of the project
 *       is built around — same visualisation in a different chrome.
 *
 * The HANDOFF state shape is preserved 1:1 in `doc` / `playback`; only
 * the rendering pipeline differs from the spec.
 */

import { drosteGeometry, type Rect as DrosteRect } from '../math/droste';
import type { DrosteCtx } from '../math/transforms';
import { doc, playback } from './state.svelte';

export type RenderInputs = {
  pixels: ImageData;
  ctx: DrosteCtx;
  R0: number;
  W: number;
  H: number;
  scale: number;
  t: number;
};

/**
 * Compute renderer inputs from the rect + a working-image crop (the
 * stable frame committed via state.svelte.ts's setRect helpers) and
 * a target canvas size. Returns null when the inputs aren't ready.
 *
 * The math runs against the crop, not the full image: S = crop.w /
 * rect.w, limit point in crop-local coords, and sampling translates
 * back to original-image coords via DrosteCtx's cropX/cropY.
 */
export function buildRenderInputs(
  pixels: ImageData,
  rect: DrosteRect,
  crop: DrosteRect,
  canvasW: number,
  canvasH: number
): RenderInputs | null {
  if (rect.w <= 0 || rect.h <= 0 || crop.w <= 0 || crop.h <= 0) return null;
  // Translate the nest into crop-local coords for drosteGeometry, which
  // assumes the working image starts at (0, 0).
  const localRect: DrosteRect = {
    x: rect.x - crop.x,
    y: rect.y - crop.y,
    w: rect.w,
    h: rect.h
  };
  const droste = drosteGeometry({ width: crop.w, height: crop.h }, localRect);
  const drosteCtx: DrosteCtx = {
    cx: droste.limit.x,
    cy: droste.limit.y,
    logS: droste.logS,
    rMax: droste.rMax,
    W: crop.w,
    H: crop.h,
    cropX: crop.x,
    cropY: crop.y,
    sampleScale: 1,
    // The frame shape picks which self-similar plane the fold fakes:
    // rectangular tiles or elliptical rings. See DrosteCtx.shape.
    shape: doc.shape
  };
  const R0 = droste.rMax / Math.sqrt(droste.S);
  const scaleW = canvasW / crop.w;
  const scaleH = canvasH / crop.h;
  const scale = Math.min(scaleW, scaleH);
  return {
    pixels,
    ctx: drosteCtx,
    R0,
    W: canvasW,
    H: canvasH,
    scale,
    t: effectiveT()
  };
}

/**
 * The renderer's `t` advances 0→1 over one Droste step OUTWARD: the
 * sample radius grows by S^t, so on-screen features contract toward
 * the limit point. direction='in' therefore needs the mirror (1 - t),
 * and 'out' passes t through. The loop stays seamless either way
 * because the renderer is periodic in t mod 1.
 */
export function effectiveT(): number {
  return playback.direction === 'in' ? 1 - playback.t : playback.t;
}

/**
 * Extract pixel ImageData from a bitmap. One-shot, on image load only.
 * The result is fed to every render call (worker reuploads on key change).
 */
export function extractPixels(bitmap: ImageBitmap): ImageData {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** Aspect-conformance: snap the rect to the chip's aspect, keep its centre. */
export function snapRectToAspect(rect: { x: number; y: number; w: number; h: number }, aspect: number | null) {
  if (aspect === null) return rect;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // Take the shorter of "width-driven height" and "height-driven width";
  // keeps area roughly invariant under the snap.
  const wDriven = { w: rect.w, h: rect.w / aspect };
  const hDriven = { w: rect.h * aspect, h: rect.h };
  const useW = Math.abs(wDriven.h - rect.h) < Math.abs(hDriven.w - rect.w);
  const sized = useW ? wDriven : hDriven;
  return { x: cx - sized.w / 2, y: cy - sized.h / 2, w: sized.w, h: sized.h };
}

/** Quick state-machine helper consumers can use to gate UI. */
export function phase(): 'empty' | 'framing' | 'edit' | 'playing' {
  if (!doc.image) return 'empty';
  if (doc.rect.w <= 0 || doc.rect.h <= 0) return 'framing';
  return playback.playing ? 'playing' : 'edit';
}
