/**
 * Pure render functions for the 4-panel pipeline explorable.
 *
 * Each derived panel (log, rotated-log, tententoon-still) is produced by a
 * function here. They take an ImageData-shaped source and return a fresh
 * ImageData-shaped buffer — no canvas, no DOM, no Svelte state. The browser
 * components (PipelinePanel.svelte) and the unit tests call the SAME
 * functions, so what a test renders to a file is exactly what ships.
 *
 * The pipeline (all rendered by inverse map → Droste-folded sample):
 *
 *   1. log(z − c)                       — log panel        (top-right)
 *   2. log rotated by β = atan(logS/2π) — rotated-log panel (bottom-left)
 *   3. (z − c)^α, α = 1 − i·logS/2π     — tententoon still  (bottom-right)
 *
 * The top-left panel is the rectangle editor (CanvasStage) — it isn't
 * rendered here; it just feeds rect/crop into `buildPanelGeometry`.
 *
 * Imports are restricted to src/lib/math/* (pure). In particular this file
 * must NOT import state.svelte / render.ts, both of which pull in Svelte
 * runes that don't load under the plain-node vitest environment.
 */

import { drosteGeometry, type Rect } from '../math/droste';
import {
  renderMappedDroste,
  sampleDroste,
  ssOffsetsForFootprint,
  type DrosteCtx,
  type Pixels
} from '../math/transforms';

/**
 * An ImageData-compatible buffer. We return this shape (rather than a real
 * `ImageData`) so the functions run under node, where the `ImageData`
 * constructor isn't defined. In the browser it's structurally assignable
 * to `ImageData` for `putImageData` after a copy, and every consumer here
 * only touches width/height/data.
 */
export type PanelImage = { width: number; height: number; data: Uint8ClampedArray };

/** Angle turns (period 2π) shown down the log panel's height. 1 → the top
 *  and bottom edges meet exactly (seamless vertical tiling) and tiles read
 *  large; raise it to pack more repeats in. */
export const LOG_V_PERIODS = 1;
/** Droste periods (period L) shown down the rotated-log panel's height. */
export const ROT_V_PERIODS = 1;

const TWO_PI = 2 * Math.PI;

/**
 * Below this logS the selection is degenerate — the nest nearly fills its
 * working frame (S ≈ 1), so there's no Droste structure to show and the
 * fold would divide by ~0. Panels surface a hint instead of rendering.
 */
export const MIN_LOGS = 0.01;

/**
 * Log-radius anchored at the canvas centre. Both log panels fill the whole
 * cell with the (doubly-periodic) lattice; the anchor just decides which
 * part is centred — log(rMax) puts the outer ring in the middle.
 */
export function panelURef(rMax: number): number {
  return Math.log(Math.max(rMax, 1));
}

/**
 * Wrap a log-radius into the outermost Droste ring (uRef − logS, uRef]. Log
 * space repeats with period logS, so the wrapped u samples identical content
 * (self-similarity) but always from the sharp outer ring — independent of how
 * many fold steps a small logS would otherwise need. Keeps the lattice
 * seamless and black-free for every valid selection.
 */
function wrapToTopRing(u: number, uRef: number, logS: number): number {
  const m = (((uRef - u) % logS) + logS) % logS;
  return uRef - m;
}

/**
 * Canvas px per log-space unit, equal on both axes so lattice tiles keep
 * their true logS : 2π proportions. Chosen from the panel height so a fixed
 * number of vertical periods is shown; the width then fills with however
 * many horizontal copies fit (the lattice repeats infinitely either way).
 */
export function panelPxPerUnit(kind: 'log' | 'rotlog', logS: number, H: number): number {
  if (kind === 'log') return H / (LOG_V_PERIODS * TWO_PI);
  const L = Math.hypot(logS, TWO_PI);
  return H / (ROT_V_PERIODS * L);
}

function blankImage(w: number, h: number): PanelImage {
  const width = Math.max(1, Math.floor(w));
  const height = Math.max(1, Math.floor(h));
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Treat a PanelImage as ImageData for the math helpers (they only read
 *  data/width/height). Keeps the node-pure functions free of the global
 *  ImageData constructor. */
function asImageData(img: PanelImage): ImageData {
  return img as unknown as ImageData;
}

/**
 * Optional transform overrides shared by the panels (the "geometry lab").
 * Omitted → canonical behaviour, so existing callers and tests are unchanged.
 *   panU/panV — pan in log space (δu, δv): δu zooms, δv rotates.
 *   rot       — rotated-log rotation angle (canonical atan(logS/2π)).
 *   kTwist    — tententoon twist k (canonical logS/2π = tan rot).
 */
export type PanelOpts = {
  panU?: number;
  panV?: number;
  rot?: number;
  kTwist?: number;
};

export type PanelGeometry = {
  /** Droste sampling context (limit point, logS, rMax, crop offset, …). */
  ctx: DrosteCtx;
  /** Orientation radius for the Escher map (= rMax / √S). */
  R0: number;
  /** Linear shrink factor S = cropW / rectW. */
  S: number;
};

/**
 * Build the crop-local Droste geometry from the user's nest + working crop.
 *
 * Mirrors buildRenderInputs() in render.ts exactly (same crop-local math),
 * but without the canvas-size-dependent `scale`/`t` — panels compute their
 * own scale — and without importing the Svelte-runed render.ts. Returns
 * null for a degenerate selection.
 */
export function buildPanelGeometry(
  rect: Rect,
  crop: Rect,
  shape: 'rect' | 'ellipse' = 'rect'
): PanelGeometry | null {
  if (rect.w <= 0 || rect.h <= 0 || crop.w <= 0 || crop.h <= 0) return null;
  const localRect: Rect = {
    x: rect.x - crop.x,
    y: rect.y - crop.y,
    w: rect.w,
    h: rect.h
  };
  const g = drosteGeometry({ width: crop.w, height: crop.h }, localRect);
  const ctx: DrosteCtx = {
    cx: g.limit.x,
    cy: g.limit.y,
    logS: g.logS,
    rMax: g.rMax,
    W: crop.w,
    H: crop.h,
    cropX: crop.x,
    cropY: crop.y,
    sampleScale: 1,
    shape
  };
  return { ctx, R0: g.rMax / Math.sqrt(g.S), S: g.S };
}

/**
 * Panel 1 — log(z − c). Fills the whole cell with the (logS, 2π) lattice.
 *
 * Horizontal axis u = log|z − c| (period logS), vertical axis v = arg(z − c)
 * (period 2π). Every output pixel maps to (u, v) at `pxPerUnit` px/unit, with
 * u = uRef at the canvas centre, then to s = c + e^u·(cos v, sin v). Because
 * log space is doubly periodic and the Droste fold finds a ring for any
 * radius, every pixel samples — the lattice tiles infinitely, no black
 * margins. (Same map as pipeline-gl.frag.glsl mode 0.)
 */
export function renderLogPanel(
  pixels: Pixels,
  ctx: DrosteCtx,
  pxPerUnit: number,
  uRef: number,
  W: number,
  H: number,
  opts: PanelOpts = {}
): PanelImage {
  const out = blankImage(W, H);
  const w = out.width;
  const h = out.height;
  const inv = 1 / pxPerUnit;
  const panU = opts.panU ?? 0;
  const panV = opts.panV ?? 0;
  renderMappedDroste(asImageData(out), pixels, ctx, (px, py, s) => {
    const u = wrapToTopRing((px - w / 2) * inv + uRef + panU, uRef, ctx.logS);
    const v = (py - h / 2) * inv + panV;
    const r = Math.exp(u);
    s.x = ctx.cx + r * Math.cos(v);
    s.y = ctx.cy + r * Math.sin(v);
    return true;
  });
  return out;
}

/**
 * Panel 2 — log(z − c) rotated by β = atan(logS / 2π). Fills the whole cell.
 *
 * The lattice diagonal (logS, 2π) rotates onto the vertical axis with period
 * L = √(logS² + 4π²). Un-rotate the centred pixel (u′, v′) by −β to recover
 * (u, v), then sample as in panel 1. A PURE rotation, illustrative of the
 * geometry — the proper Lenstra step (panel 3) also scales radii. (Same map
 * as pipeline-gl.frag.glsl mode 1.)
 */
export function renderRotatedLogPanel(
  pixels: Pixels,
  ctx: DrosteCtx,
  pxPerUnit: number,
  uRef: number,
  W: number,
  H: number,
  opts: PanelOpts = {}
): PanelImage {
  const out = blankImage(W, H);
  const w = out.width;
  const h = out.height;
  const inv = 1 / pxPerUnit;
  const rot = opts.rot ?? Math.atan2(ctx.logS, TWO_PI);
  const cosB = Math.cos(rot);
  const sinB = Math.sin(rot);
  const panU = opts.panU ?? 0;
  const panV = opts.panV ?? 0;
  renderMappedDroste(asImageData(out), pixels, ctx, (px, py, s) => {
    const cu = (px - w / 2) * inv;
    const cv = (py - h / 2) * inv;
    const u = wrapToTopRing(cu * cosB + cv * sinB + uRef + panU, uRef, ctx.logS);
    const v = -cu * sinB + cv * cosB + panV;
    const r = Math.exp(u);
    s.x = ctx.cx + r * Math.cos(v);
    s.y = ctx.cy + r * Math.sin(v);
    return true;
  });
  return out;
}

/**
 * Panel 3 — the tententoon still: w(z) = c + (z − c)^α, α = 1 − i·logS/2π.
 *
 * This is the exact map the live spiral renderer uses (CpuEscherZoomRenderer
 * / shader.frag.glsl) frozen at t = 0, so the panel is a still frame of the
 * tententoon view. `scale` is canvas-px per working-px; with the panel
 * letterboxed to the crop aspect it equals W / ctx.W = H / ctx.H.
 *
 * Adaptive supersampling (1/4/16 taps) matches the CPU renderer so the
 * dense spiral near c doesn't alias.
 */
export function renderEscherStill(
  pixels: Pixels,
  ctx: DrosteCtx,
  R0: number,
  scale: number,
  W: number,
  H: number,
  opts: PanelOpts = {}
): PanelImage {
  const out = blankImage(W, H);
  const w = out.width;
  const h = out.height;
  const data = out.data;
  const { cx, cy, logS, rMax } = ctx;
  const k = opts.kTwist ?? logS / TWO_PI;
  const panU = opts.panU ?? 0;
  const panV = opts.panV ?? 0;
  const lnR0 = Math.log(Math.max(R0, 1e-9));
  const lnRmax = Math.log(rMax);
  const alphaMag = Math.sqrt(1 + k * k);
  const rgba: [number, number, number, number] = [0, 0, 0, 0];

  // Inverse Lenstra map for one (sub)sample at canvas offset (ox, oy). The
  // log-space pan shifts the twisted radius (panU = zoom) and angle (panV).
  const sampleAt = (px: number, py: number, ox: number, oy: number): boolean => {
    const x = (px + ox) / scale;
    const y = (py + oy) / scale;
    const dx = x - cx;
    const dy = y - cy;
    const R2 = dx * dx + dy * dy;
    if (R2 < 1e-12) return false;
    const lnR = 0.5 * Math.log(R2);
    const Phi = Math.atan2(dy, dx);
    const newPhi = Phi - k * (lnR - lnR0) + panV;
    const r = Math.exp(lnR + k * Phi + panU); // t = 0
    const sx = cx + r * Math.cos(newPhi);
    const sy = cy + r * Math.sin(newPhi);
    return sampleDroste(pixels, ctx, sx, sy, rgba);
  };

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) << 2;
      const dx = px / scale - cx;
      const dy = py / scale - cy;
      const R2 = dx * dx + dy * dy;
      if (R2 < 1e-12) continue; // leave transparent at the limit point
      // Footprint = source-pixels per output-pixel; picks the SS tier.
      const lnR = 0.5 * Math.log(R2);
      const Phi = Math.atan2(dy, dx);
      const baseLnR = lnR + k * Phi + panU;
      const n = Math.max(0, Math.floor((lnRmax - baseLnR) / logS));
      const footprint = (alphaMag * Math.exp(k * Phi + panU + n * logS)) / scale;
      const offsets = ssOffsetsForFootprint(footprint);
      if (!offsets) {
        if (sampleAt(px, py, 0, 0)) {
          data[idx] = rgba[0]; data[idx + 1] = rgba[1];
          data[idx + 2] = rgba[2]; data[idx + 3] = rgba[3];
        }
        continue;
      }
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let s = 0; s < offsets.length; s++) {
        if (sampleAt(px, py, offsets[s][0], offsets[s][1])) {
          r += rgba[0]; g += rgba[1]; b += rgba[2]; a += rgba[3];
          count++;
        }
      }
      if (count > 0) {
        data[idx] = r / count; data[idx + 1] = g / count;
        data[idx + 2] = b / count; data[idx + 3] = a / count;
      }
    }
  }
  return out;
}
