/**
 * Live engine for explain.html — every panel rendered by the app's own GPU
 * pipeline (PipelinePanelGLRenderer), so there is no duplicated map math.
 *
 * The page's spine is one pipeline, shown as three connected panels that all
 * move together in realtime:
 *
 *   #exp-log   — "we log it":   log(z − c), the flat repeating strip.
 *   #exp-bend  — "we bend it":  the same strip leaned over by the bend angle.
 *   #exp-exp   — "we exponentiate it": rolled back up into the tententoon spiral.
 *
 * One bend slider leans #exp-bend and twists #exp-exp at once. Dragging the flat
 * #exp-log strip pans all three (a slide in the flat world is a zoom-and-turn in
 * the round one). #exp-exp also rolls between the flat strip (roll 0) and the
 * spiral (roll 1), so you can watch the exponential happen.
 *
 * Two geometries feed the panels so the bend is both honest and dramatic:
 *   • the PHOTO at its own gentle nesting (S ≈ 2.1, β ≈ 6.8°) — "photo"/"overlay";
 *   • a BOLD synthetic geometry (S = 20, β ≈ 25.5°, near Escher's 26°) for the
 *     scale-invariant "ring"/"grid" patterns, which stay seamless at any scale.
 * Switching source switches geometry; the bend slider's β and the "closed" mark
 * follow. The source switcher is repeated under each panel but drives one state.
 */

import { fitCropToNest, type Rect } from '../lib/math/droste';
import {
  buildPanelGeometry,
  panelPxPerUnit,
  panelURef,
  type PanelGeometry
} from '../lib/ui1/pipeline-panels';
import { PipelinePanelGLRenderer } from '../lib/render/pipeline-gl';
import type { DrosteCtx } from '../lib/math/transforms';
import { makeSource, type SourceMode } from './patterns';
import { initPlayground } from './playground';

const SOURCE = '/Droste_1260359-nevit.jpg';
const PHOTO_NEST: Rect | null = { x: 343.2, y: 334.7, w: 583.5, h: 454.9 };
const BOLD_S = 20; // β = atan(ln 20 / 2π) ≈ 25.5°, a hair under Escher's 26°

const TWO_PI = 2 * Math.PI;
const MAX_PX = 720;
const BEND_MAX_DEG = 40; // slider headroom past the boldest closing angle
const RAD = Math.PI / 180;

const byId = <T extends Element>(id: string) => document.getElementById(id) as T | null;

function centeredNest(w: number, h: number): Rect {
  const s = 0.5;
  return { x: (w * (1 - s)) / 2, y: (h * (1 - s)) / 2, w: w * s, h: h * s };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A synthetic Droste geometry with the limit point at the centre of a
 * texW×texH working rect and an arbitrary shrink S — lets the scale-invariant
 * patterns spiral as hard as we like while still closing on themselves.
 */
function boldGeometry(texW: number, texH: number, S: number): PanelGeometry {
  const cx = texW / 2;
  const cy = texH / 2;
  const logS = Math.log(S);
  const rMax = Math.hypot(Math.max(cx, texW - cx), Math.max(cy, texH - cy));
  const ctx: DrosteCtx = {
    cx, cy, logS, rMax, W: texW, H: texH, cropX: 0, cropY: 0, sampleScale: 1
  };
  return { ctx, R0: rMax / Math.sqrt(S), S };
}

type Role = 'orig' | 'log' | 'bend' | 'exp';
type Panel = { role: Role; canvas: HTMLCanvasElement; cell: HTMLElement | null; renderer: PipelinePanelGLRenderer };
type GeomInfo = {
  geom: PanelGeometry;
  uRef: number;
  lnR0: number;
  beta: number;
  betaDeg: number;
};

async function main(): Promise<void> {
  const root = byId<HTMLElement>('exp-root');
  if (!root) return;
  const fallback = byId<HTMLElement>('exp-fallback');
  const readout = byId<HTMLElement>('exp-readout');

  function showFallback(msg?: string): void {
    if (fallback) {
      fallback.hidden = false;
      if (msg) fallback.textContent = msg;
    }
    document.querySelectorAll<HTMLElement>('.live-panels, .exp-controls, .ctl-row').forEach((el) => {
      el.style.display = 'none';
    });
  }

  let photo: HTMLImageElement;
  try {
    photo = await loadImage(SOURCE);
  } catch {
    showFallback('Could not load the test image.');
    return;
  }

  const Wimg = photo.naturalWidth;
  const Himg = photo.naturalHeight;

  // ── Photo geometry (faithful, gentle) ──────────────────────────────────────
  const nest = PHOTO_NEST ?? centeredNest(Wimg, Himg);
  const crop = fitCropToNest({ width: Wimg, height: Himg }, nest, null);
  const gPhoto = buildPanelGeometry(nest, crop);
  if (!gPhoto) {
    showFallback('That nest is degenerate. Pick a smaller rectangle.');
    return;
  }
  const cImgX = crop.x + gPhoto.ctx.cx;
  const cImgY = crop.y + gPhoto.ctx.cy;
  const photoS = gPhoto.S;

  // ── Bold geometry (dramatic, seamless) — matches the crop aspect ───────────
  const texH = Math.min(960, Math.round(crop.h));
  const texW = Math.round(texH * (crop.w / crop.h));
  const gBold = boldGeometry(texW, texH, BOLD_S);

  root.style.setProperty('--cell-ar', `${crop.w} / ${crop.h}`);

  function infoFor(geom: PanelGeometry): GeomInfo {
    const beta = Math.atan2(geom.ctx.logS, TWO_PI);
    return {
      geom,
      uRef: panelURef(geom.ctx.rMax),
      lnR0: Math.log(Math.max(geom.R0, 1e-9)),
      beta,
      betaDeg: (beta * 180) / Math.PI
    };
  }
  const photoInfo = infoFor(gPhoto);
  const boldInfo = infoFor(gBold);
  const isBold = (m: SourceMode) => m === 'grid' || m === 'polar';
  const infoForSource = (m: SourceMode): GeomInfo => (isBold(m) ? boldInfo : photoInfo);

  const texCache = new Map<SourceMode, ImageData>();
  function pixelsFor(m: SourceMode): ImageData {
    const hit = texCache.get(m);
    if (hit) return hit;
    const img = isBold(m)
      ? makeSource(m, photo, texW, texH, texW / 2, texH / 2, BOLD_S)
      : makeSource(m, photo, Wimg, Himg, cImgX, cImgY, photoS);
    texCache.set(m, img);
    return img;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    source: 'overlay' as SourceMode,
    angle: photoInfo.beta, // the bend; starts at the closing angle of the active geometry
    panU: 0, // shared pan from dragging the flat strip (slide = zoom/turn)
    panV: 0,
    roll: 1 // exp panel: 0 = flat bent strip … 1 = rolled-up spiral (default)
  };

  // ── Panels ───────────────────────────────────────────────────────────────
  const idByRole: Record<Role, string> = {
    orig: 'exp-orig', log: 'exp-log', bend: 'exp-bend', exp: 'exp-exp'
  };
  const panels: Panel[] = [];
  try {
    for (const role of Object.keys(idByRole) as Role[]) {
      const canvas = byId<HTMLCanvasElement>(idByRole[role]);
      if (!canvas) continue;
      const renderer = new PipelinePanelGLRenderer();
      renderer.init(canvas);
      panels.push({ role, canvas, cell: canvas.closest('.panel-cell'), renderer });
    }
  } catch {
    for (const p of panels) p.renderer.dispose();
    showFallback();
    return;
  }

  function canvasPx(canvas: HTMLCanvasElement): { cw: number; ch: number } | null {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    let cw = Math.round(r.width * dpr);
    let ch = Math.round(r.height * dpr);
    const long = Math.max(cw, ch);
    if (long > MAX_PX) {
      const s = MAX_PX / long;
      cw = Math.max(1, Math.round(cw * s));
      ch = Math.max(1, Math.round(ch * s));
    }
    return { cw, ch };
  }

  function renderPanel(p: Panel): void {
    const dim = canvasPx(p.canvas);
    if (!dim) return;
    const { cw, ch } = dim;
    const info = infoForSource(state.source);
    const ctx = info.geom.ctx;
    const pixels = pixelsFor(state.source);
    const a = state.angle;
    switch (p.role) {
      case 'orig': // the input picture itself (no twist), zoomed/turned by the pan
        p.renderer.render({
          pixels, ctx, mode: 'escher', W: cw, H: ch,
          scale: cw / ctx.W, lnR0: info.lnR0, kTwist: 0, panU: state.panU, panV: state.panV
        });
        break;
      case 'log':
        p.renderer.render({
          pixels, ctx, mode: 'log', W: cw, H: ch,
          pxPerUnit: panelPxPerUnit('log', ctx.logS, ch),
          uRef: info.uRef, panU: state.panU, panV: state.panV
        });
        break;
      case 'bend':
        p.renderer.render({
          pixels, ctx, mode: 'rotlog', W: cw, H: ch,
          pxPerUnit: panelPxPerUnit('rotlog', ctx.logS, ch),
          uRef: info.uRef, rot: a, panU: state.panU, panV: state.panV
        });
        break;
      case 'exp':
        p.renderer.render({
          pixels, ctx, mode: 'unroll', W: cw, H: ch,
          pxPerUnit: panelPxPerUnit('rotlog', ctx.logS, ch),
          uRef: info.uRef, lnR0: info.lnR0, rot: a, kTwist: Math.tan(a),
          morph: state.roll, panU: state.panU, panV: state.panV
        });
        break;
    }
  }

  // ── Render scheduler (discrete updates + running animations) ───────────────
  let raf = 0;
  let dirtyAll = false;
  const dirty = new Set<Role>();
  let last = performance.now();

  let snapping = false;
  let snapFrom = 0;
  let snapTo = 0;
  let snapT = 0;

  function schedule(only?: Role[]): void {
    if (only) only.forEach((r) => dirty.add(r));
    else dirtyAll = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let more = false;

    if (snapping) {
      snapT += dt / 0.45;
      const e = snapT >= 1 ? 1 : easeOutCubic(snapT);
      state.angle = snapFrom + (snapTo - snapFrom) * e;
      syncBendUI();
      dirty.add('bend');
      dirty.add('exp');
      if (snapT >= 1) snapping = false;
      else more = true;
    }

    const all = dirtyAll;
    dirtyAll = false;
    const set = new Set(dirty);
    dirty.clear();
    for (const p of panels) if (all || set.has(p.role)) renderPanel(p);
    updateReadout();

    if (more) raf = requestAnimationFrame(tick);
  }

  function updateReadout(): void {
    if (!readout) return;
    if (state.panU === 0 && state.panV === 0) {
      readout.textContent = 'drag the flat strip: ↔ zooms everything, ↕ turns it';
      return;
    }
    const zoom = Math.exp(state.panU);
    let deg = ((state.panV * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    readout.textContent = `slid by ${state.panU >= 0 ? '+' : ''}${state.panU.toFixed(2)} → zoom ×${zoom.toFixed(2)}, turn ${deg.toFixed(0)}°`;
  }

  // ── Bend (the lean that becomes the twist) ─────────────────────────────────
  const bend = byId<HTMLInputElement>('exp-bend-range');
  const bendVal = byId<HTMLElement>('exp-bend-val');
  const bendNote = byId<HTMLElement>('exp-bend-note');
  const bendCells = panels.filter((p) => p.role === 'bend' || p.role === 'exp').map((p) => p.cell);
  const mS = byId<HTMLElement>('m-s');
  const mLogS = byId<HTMLElement>('m-logs');
  const mK = byId<HTMLElement>('m-k');
  const fmtS = (s: number) => (s < 10 ? s.toFixed(2) : s.toFixed(0));

  function syncBendUI(): void {
    const deg = state.angle / RAD;
    const betaDeg = infoForSource(state.source).betaDeg;
    const closed = Math.abs(deg - betaDeg) < 0.4;
    if (bend && document.activeElement !== bend) bend.value = deg.toFixed(1);
    if (bendVal) {
      bendVal.textContent = `${deg.toFixed(1)}°`;
      bendVal.classList.toggle('closed', closed);
    }
    bendCells.forEach((c) => c?.classList.toggle('is-closed', closed));
    if (bendNote) {
      bendNote.innerHTML = closed
        ? 'closed ✓ — the tiles line back up'
        : `lines up at <em>β</em> ≈ ${betaDeg.toFixed(1)}°`;
    }
    // Live map values from the user's source + lean choices.
    const info = infoForSource(state.source);
    if (mS) mS.textContent = fmtS(info.geom.S);
    if (mLogS) mLogS.textContent = info.geom.ctx.logS.toFixed(2);
    if (mK) mK.textContent = Math.tan(state.angle).toFixed(2);
  }

  function setBendDeg(deg: number): void {
    state.angle = deg * RAD;
    snapping = false;
    syncBendUI();
    schedule(['bend', 'exp']);
  }

  if (bend) {
    bend.min = '0';
    bend.max = String(BEND_MAX_DEG);
    bend.step = '0.1';
    bend.value = photoInfo.betaDeg.toFixed(1);
    bend.addEventListener('input', () => setBendDeg(parseFloat(bend.value)));
  }
  byId<HTMLButtonElement>('exp-bend-snap')?.addEventListener('click', () => {
    snapFrom = state.angle;
    snapTo = infoForSource(state.source).beta;
    snapT = 0;
    snapping = true;
    schedule(['bend', 'exp']);
  });

  // ── Roll (the exponential: flat strip → spiral) ────────────────────────────
  const roll = byId<HTMLInputElement>('exp-roll');

  function syncRollUI(): void {
    if (roll && document.activeElement !== roll) roll.value = String(Math.round(state.roll * 100));
  }
  if (roll) {
    roll.min = '0';
    roll.max = '100';
    roll.step = '1';
    roll.value = '100';
    roll.addEventListener('input', () => {
      state.roll = parseFloat(roll.value) / 100;
      syncRollUI();
      schedule(['exp']);
    });
  }

  // ── Source mode (one global state; switcher repeated under each panel) ─────
  function setSource(mode: SourceMode): void {
    state.source = mode;
    state.angle = infoForSource(mode).beta; // reset to the closing angle of the new geometry
    snapping = false;
    document.querySelectorAll<HTMLElement>('[data-source]').forEach((b) => {
      b.classList.toggle('on', b.dataset.source === mode);
    });
    syncBendUI();
    schedule();
  }
  document.querySelectorAll<HTMLElement>('[data-source]').forEach((b) => {
    b.addEventListener('click', () => setSource((b.dataset.source as SourceMode) ?? 'polar'));
  });

  // ── Drag the flat strip → pan every panel (slide = zoom + turn) ────────────
  const logCanvas = byId<HTMLCanvasElement>('exp-log');
  if (logCanvas) {
    let active = false;
    let lastX = 0;
    let lastY = 0;
    logCanvas.addEventListener('pointerdown', (e) => {
      active = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try {
        logCanvas.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      e.preventDefault();
    });
    logCanvas.addEventListener('pointermove', (e) => {
      if (!active) return;
      const h = logCanvas.getBoundingClientRect().height || 1;
      const perUnit = h / TWO_PI; // one cell height = 2π = one full turn
      // Natural drag: the strip follows the pointer (content moves with the hand).
      state.panU -= (e.clientX - lastX) / perUnit;
      state.panV -= (e.clientY - lastY) / perUnit;
      lastX = e.clientX;
      lastY = e.clientY;
      schedule(['log', 'bend', 'exp']);
    });
    const end = (e: PointerEvent) => {
      active = false;
      try {
        logCanvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    logCanvas.addEventListener('pointerup', end);
    logCanvas.addEventListener('pointercancel', end);
  }

  byId<HTMLButtonElement>('exp-reset')?.addEventListener('click', () => {
    state.panU = 0;
    state.panV = 0;
    schedule(['log', 'bend', 'exp']);
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('[data-source]').forEach((b) => {
    b.classList.toggle('on', b.dataset.source === state.source);
  });
  syncBendUI();
  syncRollUI();
  new ResizeObserver(() => schedule()).observe(root);
  schedule();
}

void main();
initPlayground();
