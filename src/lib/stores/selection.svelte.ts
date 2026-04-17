import type { Rect } from '../math/droste';
import { clampRect } from '../math/droste';

export const selectionState = $state<{ rect: Rect | null }>({
  rect: null
});

/**
 * Initialise the rectangle. Prefers a supplied preset (e.g. the known good
 * geometry for a known Droste image); otherwise falls back to a centred
 * aspect-locked rectangle at S ≈ 3.
 */
export function initSelection(image: { width: number; height: number }, preset?: Rect) {
  if (preset) {
    selectionState.rect = clampRect(image, preset);
    return;
  }
  const w = image.width / 3;
  const h = w * (image.height / image.width);
  const x = (image.width - w) / 2;
  const y = (image.height - h) / 2;
  selectionState.rect = clampRect(image, { x, y, w, h });
}

export function setRect(image: { width: number; height: number }, rect: Rect) {
  selectionState.rect = clampRect(image, rect);
}
