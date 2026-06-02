/**
 * UI variant 1 — shared $state runes. Mirrors HANDOFF.md §3 (ui / doc /
 * playback). Scoped to /ui1; the main view's stores are untouched.
 *
 * State machine implied by the runes:
 *   Empty   doc.image == null
 *   Framing doc.image set, doc.rect zero
 *   Edit    doc.rect non-zero, playback.playing == false
 *   Playing playback.playing == true
 *   (Exporting is owned by export-* modules; the rune state is whatever it
 *    was when the export started.)
 */

import { fitCropToNest, ensureNestInside, type Rect as DrosteRect } from '../math/droste';
import { resetExperiment } from './pipeline-experiments.svelte';

export type Tool = 'select' | 'rect' | 'pan';
export type Direction = 'in' | 'out';
export type Theme = 'light-neutral' | 'light-warm' | 'dark-warm';
/**
 * Which stage(s) are visible.
 *   split   — image+rect side-by-side with the spiral preview (default).
 *   source  — only the source image with the rect overlay.
 *   preview — only the live tententoon spiral.
 *   droste  — the regular nested-rectangle Droste effect with a smooth
 *             self-similar zoom. While this mode is active, exports
 *             and shares capture this animation instead of the spiral.
 *   pipeline— the 4-panel explorable: rect editor (top-left) + the log,
 *             rotated-log, and tententoon-still derived panels. A static
 *             view of the math; playback/exports are irrelevant here.
 *   playground— the complex playground: pick a complex function f(z), tweak
 *             its parameters live, and hand-drag to add a complex constant.
 *             Uses doc.image only (its own complex frame, not doc.rect).
 * All stages stay mounted in every mode so each one's renderFrame
 * binding survives view switches; the inactive stages are hidden in
 * CSS, which also short-circuits their render effects via 0×0
 * ResizeObserver readouts.
 */
export type ViewMode = 'split' | 'preview' | 'droste' | 'pipeline' | 'playground';

export type Rect = { x: number; y: number; w: number; h: number };

export const ui = $state<{
  tool: Tool;
  view: ViewMode;
  zoom: 'fit' | number;
  exportMenuOpen: boolean;
  theme: Theme;
  /** Hint shown briefly after an export completes. */
  exportToast: string | null;
}>({
  tool: 'rect',
  view: 'split',
  zoom: 'fit',
  exportMenuOpen: false,
  theme: 'light-neutral',
  exportToast: null
});

export const doc = $state<{
  image: ImageBitmap | null;
  imageName: string;
  rect: Rect;
  /**
   * Working-image crop: the rectangle the renderer treats as its
   * input frame. Stored as state (rather than purely derived from
   * `rect`) so that translating the nest leaves the crop stable —
   * the user gets a steady reference frame instead of a working
   * window that follows the cursor. Refits on resize, on a fresh
   * marquee draw, or on image change; nulled when no rect is set.
   */
  crop: Rect | null;
}>({
  image: null,
  imageName: '',
  rect: { x: 0, y: 0, w: 0, h: 0 },
  crop: null
});

export const playback = $state<{
  playing: boolean;
  t: number;
  speed: 0.5 | 1 | 2 | 4;
  direction: Direction;
  loopLength: number;
  exporting: boolean;
}>({
  // Autoplay by default: the moment a rect is drawn we want the spiral
  // to be the thing the user sees, not a still frame waiting for input.
  playing: true,
  t: 0,
  speed: 1,
  direction: 'in',
  loopLength: 3,
  exporting: false
});

/** Replace the working image and clear the rect + crop. */
export function setImage(image: ImageBitmap | null, name = ''): void {
  doc.image?.close?.();
  doc.image = image;
  doc.imageName = name;
  doc.rect = { x: 0, y: 0, w: 0, h: 0 };
  doc.crop = null;
  playback.playing = false;
  playback.t = 0;
  // A new image has fresh geometry; clear any stashed geometry-lab pan/angle
  // so the pipeline view doesn't open with a surprising transform.
  resetExperiment();
}

// --- Rect/crop commit helpers ------------------------------------------
//
// Three commit shapes, mirroring the legacy selection.svelte.ts:setNest
// semantics. Drag handlers in CanvasStage call the matching helper
// instead of writing doc.rect directly, so the crop bookkeeping happens
// in one place.

function imageSize(): { width: number; height: number } | null {
  if (!doc.image) return null;
  return { width: doc.image.width, height: doc.image.height };
}

/**
 * Initial commit for a fresh marquee draw or any time we want the crop
 * to recentre on the nest. Crop fits around the nest, anchored on it.
 */
export function commitNewRect(rect: Rect): void {
  doc.rect = rect;
  const sz = imageSize();
  if (!sz || rect.w <= 0 || rect.h <= 0) { doc.crop = null; return; }
  doc.crop = fitCropToNest(sz, rect as DrosteRect, null);
}

/**
 * Body translate. Crop stays put; the nest is shifted minimally to
 * stay inside it. Falls back to commitNewRect when there's no crop
 * yet (first interaction after image load).
 */
export function commitTranslate(rect: Rect): void {
  if (!doc.crop) { commitNewRect(rect); return; }
  doc.rect = ensureNestInside(rect as DrosteRect, doc.crop);
}

/**
 * Handle/marquee resize. Crop refits with the previous crop's centre
 * as anchor, so the working frame stays stable across pure-translate
 * gestures but resizes when the aspect changes or the nest outgrows
 * the current crop.
 */
export function commitResize(rect: Rect): void {
  doc.rect = rect;
  const sz = imageSize();
  if (!sz || rect.w <= 0 || rect.h <= 0) { doc.crop = null; return; }
  doc.crop = fitCropToNest(sz, rect as DrosteRect, doc.crop);
  doc.rect = ensureNestInside(doc.rect as DrosteRect, doc.crop);
}

/**
 * Crop translate: the user dragging the working frame around the (now
 * stationary) nest. Clamps the proposed crop position to two
 * constraints — the crop must (a) stay inside the image and (b)
 * still fully contain the nest. The nest is NOT moved; only the
 * crop's x/y change. Width/height come from doc.crop and are
 * preserved (translate, not resize).
 */
export function commitCropTranslate(next: Rect): void {
  if (!doc.image || !doc.crop) return;
  const img = imageSize()!;
  const nest = doc.rect;
  const minX = Math.max(0, nest.x + nest.w - next.w);
  const maxX = Math.min(img.width - next.w, nest.x);
  const minY = Math.max(0, nest.y + nest.h - next.h);
  const maxY = Math.min(img.height - next.h, nest.y);
  // No valid position (shouldn't happen — fitCropToNest always returns
  // a crop ⊇ nest that's also ⊆ image, so the intersection is non-empty
  // when called from CanvasStage). Bail safely if it ever does.
  if (minX > maxX || minY > maxY) return;
  doc.crop = {
    x: Math.max(minX, Math.min(maxX, next.x)),
    y: Math.max(minY, Math.min(maxY, next.y)),
    w: next.w,
    h: next.h
  };
}

/** Image's aspect ratio (W/H) or 0 when no image. */
export function imageAspect(): number {
  return doc.image ? doc.image.width / doc.image.height : 0;
}

// --- Theme: system-aware light/dark with manual override ---------------
//
// ui.theme drives the .theme-* class on .ui1-root and is what CSS reads.
// The selection is keyed off the user's manual override (localStorage)
// when present, otherwise the OS preference. UiVariant1 subscribes to
// matchMedia and re-applies on OS change when no override is set.

const THEME_STORAGE_KEY = 'ui1-theme';

/** Map a logical pref ('light' | 'dark') to a concrete Theme token. */
function themeFor(pref: 'light' | 'dark'): Theme {
  return pref === 'dark' ? 'dark-warm' : 'light-neutral';
}

/** The user's manual override, or null when following the OS. */
export function readThemeOverride(): 'light' | 'dark' | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

/** Current OS-level light/dark preference. Defaults to 'light' off-DOM. */
export function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Compute and apply the effective theme to ui.theme. */
export function applyTheme(): void {
  const pref = readThemeOverride() ?? systemTheme();
  ui.theme = themeFor(pref);
}

/**
 * Set or clear the manual override. Passing null returns to following
 * the OS preference. Either way we apply immediately.
 */
export function setThemeOverride(pref: 'light' | 'dark' | null): void {
  if (typeof localStorage !== 'undefined') {
    if (pref) localStorage.setItem(THEME_STORAGE_KEY, pref);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  }
  applyTheme();
}
