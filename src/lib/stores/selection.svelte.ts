import type { Rect } from '../math/droste';
import { clampRect } from '../math/droste';

export const selectionState = $state<{ rect: Rect | null }>({
  rect: null
});

/** Initialize a centred rectangle at ~1/3 the image width (S = 3), aspect-locked. */
export function initSelection(image: { width: number; height: number }) {
  const w = image.width / 3;
  const h = w * (image.height / image.width);
  const x = (image.width - w) / 2;
  const y = (image.height - h) / 2;
  selectionState.rect = clampRect(image, { x, y, w, h });
}

export function setRect(image: { width: number; height: number }, rect: Rect) {
  selectionState.rect = clampRect(image, rect);
}
