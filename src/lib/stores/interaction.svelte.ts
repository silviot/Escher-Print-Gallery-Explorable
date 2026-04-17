import type { Point } from '../math/droste';

/**
 * Tracks where the user's attention is in image-pixel coordinates, so auxiliary
 * panels (magnifier, annotations) can center on the right spot.
 *
 * - `focus` is the pointer position while hovering, or the actively-dragged handle
 *   while dragging.
 * - `active` is true between pointerdown and pointerup, so consumers can keep the
 *   focus pinned instead of chasing a pointer that has left the picker.
 */
export const interactionState = $state<{ focus: Point | null; active: boolean }>({
  focus: null,
  active: false
});
