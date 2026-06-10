/**
 * Shared toolkit for the /experiments/* UX prototypes.
 *
 * Each experiment page is a standalone vite entry (experiments/<name>.html
 * + src/experiments/<name>.ts) that presents the SAME underlying engine —
 * the project's GPU log-polar pipeline — inside a radically different UX
 * frame. This module hides the renderer plumbing behind a small API so an
 * experiment file reads as pure interaction design.
 *
 * ── Coordinate spaces ──────────────────────────────────────────────────
 * Everything in a Scene (nest, crop) lives in ORIGINAL image pixels.
 * The GL texture is a downscaled copy (≤ MAX_TEX px); DrosteCtx.sampleScale
 * carries the conversion, so callers never see texture coords.
 *
 * ── Time convention ────────────────────────────────────────────────────
 * All animation helpers take t ∈ [0,1), one seamless loop period, where
 * t increasing means the camera dives INWARD (zoom in). This matches the
 * main app's "In" direction after the 2026-06 fix.
 *
 * ── Typical usage ──────────────────────────────────────────────────────
 *   const scene = await loadDemoScene();
 *   const view = new SpiralView(canvas);
 *   view.setScene(scene);
 *   const loop = startLoop((t) => view.render({ t }), { period: 5 });
 *   attachImageInput(document.body, (img) => {
 *     view.setScene(buildScene(img));
 *   });
 */

import { drosteGeometry, fitCropToNest, type Rect } from '../lib/math/droste';
import type { DrosteCtx } from '../lib/math/transforms';
import { PipelinePanelGLRenderer, type PanelMode } from '../lib/render/pipeline-gl';
import { panelPxPerUnit, panelURef } from '../lib/ui1/pipeline-panels';
import { publicAssetUrl } from '../lib/asset-url';

export type { Rect };
export { publicAssetUrl };

const TWO_PI = 2 * Math.PI;
/** Longest texture edge uploaded to the GPU. */
const MAX_TEX = 1280;

/** The bundled demo photo (public/) and its known-good nest rectangle —
 *  same values the explainer page uses. S ≈ 2.16, β ≈ 7°. */
export const DEMO_IMAGE = 'Droste_1260359-nevit.jpg';
export const DEMO_NEST: Rect = { x: 343.2, y: 334.7, w: 583.5, h: 454.9 };
/** Alternative demo assets available in public/. */
export const DEMO_IMAGE_PLAIN = 'pre-droste-nevit.jpg';
export const DEMO_IMAGE_ESCHER = '3b1b-print-gallery.jpg';

export type Geometry = { ctx: DrosteCtx; R0: number; S: number };

export type Scene = {
  /** Full-resolution source, for 2D canvas drawing. */
  img: HTMLImageElement | ImageBitmap;
  /** Downscaled pixels for the GL texture (sampleScale bridges coords). */
  pixels: ImageData;
  /** Nest rectangle, original-image coords. */
  nest: Rect;
  /** Working crop (largest nest-aspect rect containing it), image coords. */
  crop: Rect;
  /** Crop-local Droste geometry (limit point, logS, rMax, R0, S). */
  geom: Geometry;
};

export function loadImageEl(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img.decode().then(() => img);
}

function extractPixels(img: HTMLImageElement | ImageBitmap, maxEdge: number): ImageData {
  const w = img.width;
  const h = img.height;
  const f = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * f));
  const th = Math.max(1, Math.round(h * f));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, 0, 0, tw, th);
  return ctx.getImageData(0, 0, tw, th);
}

/** Default nest when none is given: centred, 42% of the short side
 *  (S ≈ 2.4 — a comfortable, visibly spiralling shrink). */
export function defaultNest(img: { width: number; height: number }): Rect {
  const s = 0.42;
  const w = img.width * s;
  const h = img.height * s;
  return { x: (img.width - w) / 2, y: (img.height - h) / 2, w, h };
}

/**
 * Build a Scene from an image + optional nest (image coords).
 * Re-call after every nest edit — geometry building is sub-millisecond;
 * pixel extraction is reused when you pass the previous scene.
 */
export function buildScene(
  img: HTMLImageElement | ImageBitmap,
  nest?: Rect,
  reuse?: Scene
): Scene {
  const n = nest ?? defaultNest(img);
  const crop = fitCropToNest(img, n);
  const localNest: Rect = { x: n.x - crop.x, y: n.y - crop.y, w: n.w, h: n.h };
  const g = drosteGeometry({ width: crop.w, height: crop.h }, localNest);
  const pixels = reuse && reuse.img === img ? reuse.pixels : extractPixels(img, MAX_TEX);
  const sampleScale = pixels.width / img.width;
  const ctx: DrosteCtx = {
    cx: g.limit.x,
    cy: g.limit.y,
    logS: g.logS,
    rMax: g.rMax,
    W: crop.w,
    H: crop.h,
    cropX: crop.x,
    cropY: crop.y,
    sampleScale
  };
  return { img, pixels, nest: n, crop, geom: { ctx, R0: g.rMax / Math.sqrt(g.S), S: g.S } };
}

export async function loadDemoScene(): Promise<Scene> {
  const img = await loadImageEl(publicAssetUrl(DEMO_IMAGE));
  return buildScene(img, DEMO_NEST);
}

/* ── GPU view ──────────────────────────────────────────────────────── */

export type SpiralRenderOpts = {
  /** Loop phase ∈ [0,1); larger t = deeper in. Default 0. */
  t?: number;
  /**
   * Twist amount as a fraction of canonical: 0 = no rotation (the plain
   * Droste fold, copies dropping straight in), 1 = the canonical
   * tententoon spiral (k = logS/2π). Values beyond 1 over-twist.
   * Default 1.
   */
  twist?: number;
  /** Raw k override; wins over `twist` when set. */
  kTwist?: number;
  /** Render mode. 'escher' (default) is the spiral; 'log' the flat strip;
   *  'rotlog' the leaned strip; 'unroll' morphs strip↔spiral via `morph`. */
  mode?: PanelMode;
  /** unroll mode only: 0 = flat strip, 1 = rolled-up spiral. */
  morph?: number;
  /** Extra whole-image rotation in radians (angle pan). */
  panV?: number;
  /** rotlog/unroll: lean angle of the strip in radians. Default is the
   *  canonical atan(logS/2π); pass 0 for an unleaned strip and animate
   *  toward canonical for the "lean it over" beat. */
  rot?: number;
};

/**
 * A GL spiral/strip view bound to one canvas. Letterboxes nothing —
 * the canvas is rendered edge to edge; callers who want the crop's
 * aspect should size the canvas accordingly (see fitContain).
 */
export class SpiralView {
  private renderer: PipelinePanelGLRenderer;
  private scene: Scene | null = null;
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new PipelinePanelGLRenderer();
    this.renderer.init(canvas);
  }

  setScene(scene: Scene): void {
    this.scene = scene;
  }

  /**
   * Size the canvas's pixel store from its CSS box (call on resize).
   * Returns false when the box is 0×0 (hidden).
   */
  autosize(maxDpr = 2): boolean {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    return true;
  }

  render(opts: SpiralRenderOpts = {}): void {
    const s = this.scene;
    if (!s) return;
    const { ctx } = s.geom;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (W < 1 || H < 1) return;
    const mode = opts.mode ?? 'escher';
    const t = opts.t ?? 0;
    // t grows → panU shrinks from logS to 0 → sample radius shrinks →
    // the camera dives inward. Seamless because panU is period-logS.
    const panU = (1 - (((t % 1) + 1) % 1)) * ctx.logS;
    const kTwist =
      opts.kTwist ?? (opts.twist ?? 1) * (ctx.logS / TWO_PI);
    // escher: cover (not letterbox) — scale so the crop fills the canvas.
    const scale = Math.max(W / ctx.W, H / ctx.H);
    this.renderer.render({
      pixels: s.pixels,
      ctx,
      mode,
      W,
      H,
      pxPerUnit: panelPxPerUnit(mode === 'log' ? 'log' : 'rotlog', ctx.logS, H),
      uRef: panelURef(ctx.rMax),
      scale,
      lnR0: Math.log(Math.max(s.geom.R0, 1e-9)),
      kTwist,
      panU,
      panV: opts.panV ?? 0,
      rot: opts.rot,
      morph: opts.morph ?? (mode === 'unroll' ? 1 : 0)
    });
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene = null;
  }
}

/* ── 2D classic-Droste view ────────────────────────────────────────── */

/**
 * Paint one frame of the classic nested-copies Droste zoom onto `target`
 * (2D canvas, full canvas area, camera covers the crop). t ∈ [0,1),
 * larger t = deeper in. Ported from the app's DrosteStage.
 *
 * Pass camera:false to draw the static nested image with no zoom
 * (equivalent to t = 0 but clearer at call sites).
 */
export function drawDrosteZoom(
  target: HTMLCanvasElement,
  scene: Scene,
  t: number,
  opts: { camera?: boolean; background?: string } = {}
): void {
  const { crop, nest, img } = scene;
  const W = crop.w;
  const H = crop.h;
  const sx = nest.w / W;
  const sy = nest.h / H;
  if (!(sx > 0 && sx < 1 && sy > 0 && sy < 1)) return;
  const Rx = nest.x - crop.x;
  const Ry = nest.y - crop.y;
  const effT = opts.camera === false ? 0 : ((t % 1) + 1) % 1;

  const scaleX = Math.pow(sx, effT);
  const scaleY = Math.pow(sy, effT);
  const camCx = ((1 - scaleX) / (1 - sx)) * Rx + scaleX * (W / 2);
  const camCy = ((1 - scaleY) / (1 - sy)) * Ry + scaleY * (H / 2);
  const camW = W * scaleX;
  const camH = H * scaleY;
  const camX = camCx - camW / 2;
  const camY = camCy - camH / 2;

  const tw = target.width;
  const th = target.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = opts.background ?? '#000';
  ctx.fillRect(0, 0, tw, th);

  const ax = tw / camW;
  const ay = th / camH;
  ctx.setTransform(ax, 0, 0, ay, -camX * ax, -camY * ay);

  const minWidthPx = 0.5;
  const nMaxFromSx = Math.floor(effT + Math.log(minWidthPx / tw) / Math.log(sx));
  const nMaxFromSy = Math.floor(effT + Math.log(minWidthPx / th) / Math.log(sy));
  const nMax = Math.min(Math.max(nMaxFromSx, nMaxFromSy) + 1, 60);

  let pxw = 1;
  let pyw = 1;
  let xn = 0;
  let yn = 0;
  for (let n = 0; n <= nMax; n++) {
    const rw = W * pxw;
    const rh = H * pyw;
    if (xn + rw >= camX && xn <= camX + camW && yn + rh >= camY && yn <= camY + camH) {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, xn, yn, rw, rh);
    }
    xn += Rx * pxw;
    yn += Ry * pyw;
    pxw *= sx;
    pyw *= sy;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ── Playback loop ─────────────────────────────────────────────────── */

export type Loop = {
  /** Current phase ∈ [0,1). Assignable (scrubbing). */
  t: number;
  playing: boolean;
  period: number;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Stop the rAF loop entirely (page teardown). */
  stop(): void;
};

/**
 * Drive `render(t)` from requestAnimationFrame. One loop = `period`
 * seconds. The callback also runs while paused (so scrubbing t or
 * changing other inputs repaints) — keep renders cheap or gate on
 * your own dirty flag.
 */
export function startLoop(
  render: (t: number) => void,
  opts: { period?: number; autoplay?: boolean } = {}
): Loop {
  let raf = 0;
  let last = performance.now();
  const state: Loop = {
    t: 0,
    playing: opts.autoplay ?? true,
    period: opts.period ?? 5,
    play() { state.playing = true; },
    pause() { state.playing = false; },
    toggle() { state.playing = !state.playing; },
    stop() { cancelAnimationFrame(raf); }
  };
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing) state.t = (state.t + dt / state.period) % 1;
    render(state.t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return state;
}

/* ── Layout helper ─────────────────────────────────────────────────── */

export type Fit = { w: number; h: number; offX: number; offY: number; scale: number };

/** Largest src-aspect box inside dst (letterbox / object-fit: contain). */
export function fitContain(srcW: number, srcH: number, dstW: number, dstH: number): Fit {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { w, h, offX: (dstW - w) / 2, offY: (dstH - h) / 2, scale };
}

/* ── Image input (drop / paste / pick) ─────────────────────────────── */

/**
 * Wire drag-drop + clipboard-paste (+ optional click-to-pick) image
 * loading onto an element. Calls onImage with a decoded element ready
 * for buildScene. Adds/removes a `drop-hover` class on drag-over so
 * pages can style the affordance.
 */
export function attachImageInput(
  el: HTMLElement,
  onImage: (img: HTMLImageElement) => void,
  opts: { click?: boolean } = {}
): void {
  const fromFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    void loadImageEl(url).then((img) => {
      onImage(img);
      URL.revokeObjectURL(url);
    });
  };
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drop-hover');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hover'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drop-hover');
    fromFile(e.dataTransfer?.files?.[0]);
  });
  window.addEventListener('paste', (e) => {
    const items = (e as ClipboardEvent).clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        fromFile(item.getAsFile());
        return;
      }
    }
  });
  if (opts.click) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => fromFile(input.files?.[0]));
    el.addEventListener('click', () => input.click());
  }
}

/* ── Nest-rect editor ──────────────────────────────────────────────── */

export type RectEditorView = {
  /** Image-coords → element-CSS-px mapping of the displayed photo. */
  offX: number;
  offY: number;
  scale: number;
};

export type RectEditor = {
  rect: Rect;
  detach(): void;
};

/**
 * Pointer-drag editing of the nest rect over a displayed photo.
 *
 * `el` is the interaction surface (usually the photo's wrapper).
 * `getView()` supplies the current image→CSS mapping (recompute it on
 * resize). Behaviour: drag inside the rect moves it; drag on a corner
 * (12 CSS px) resizes from that corner; drag elsewhere draws a fresh
 * rect. The rect is clamped to the image and to a sensible minimum
 * (24 image px, < 95% of the image per axis — S stays > 1).
 *
 * The editor owns no painting: `onChange(rect, phase)` fires on every
 * pointer move ('drag') and once on release ('commit') — draw your own
 * overlay and rebuild the scene on whichever cadence suits the page.
 */
export function attachRectEditor(
  el: HTMLElement,
  image: { width: number; height: number },
  initial: Rect,
  getView: () => RectEditorView,
  onChange: (rect: Rect, phase: 'drag' | 'commit') => void
): RectEditor {
  let rect: Rect = { ...initial };
  type Mode =
    | { kind: 'none' }
    | { kind: 'move'; dx: number; dy: number }
    | { kind: 'resize'; ax: number; ay: number }
    | { kind: 'draw'; ax: number; ay: number };
  let mode: Mode = { kind: 'none' };

  const toImage = (e: PointerEvent) => {
    const v = getView();
    const r = el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - v.offX) / v.scale,
      y: (e.clientY - r.top - v.offY) / v.scale
    };
  };

  const clampRect = (r: Rect): Rect => {
    const minPx = 24;
    const w = Math.min(Math.max(r.w, minPx), image.width * 0.95);
    const h = Math.min(Math.max(r.h, minPx), image.height * 0.95);
    const x = Math.max(0, Math.min(image.width - w, r.x));
    const y = Math.max(0, Math.min(image.height - h, r.y));
    return { x, y, w, h };
  };

  const onDown = (e: PointerEvent) => {
    const p = toImage(e);
    const v = getView();
    const grab = 12 / v.scale;
    const corners = [
      { cx: rect.x, cy: rect.y, ax: rect.x + rect.w, ay: rect.y + rect.h },
      { cx: rect.x + rect.w, cy: rect.y, ax: rect.x, ay: rect.y + rect.h },
      { cx: rect.x, cy: rect.y + rect.h, ax: rect.x + rect.w, ay: rect.y },
      { cx: rect.x + rect.w, cy: rect.y + rect.h, ax: rect.x, ay: rect.y }
    ];
    const corner = corners.find((c) => Math.hypot(p.x - c.cx, p.y - c.cy) < grab);
    if (corner) {
      mode = { kind: 'resize', ax: corner.ax, ay: corner.ay };
    } else if (
      p.x >= rect.x && p.x <= rect.x + rect.w &&
      p.y >= rect.y && p.y <= rect.y + rect.h
    ) {
      mode = { kind: 'move', dx: p.x - rect.x, dy: p.y - rect.y };
    } else {
      mode = { kind: 'draw', ax: p.x, ay: p.y };
    }
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onMove = (e: PointerEvent) => {
    if (mode.kind === 'none') return;
    const p = toImage(e);
    if (mode.kind === 'move') {
      rect = clampRect({ ...rect, x: p.x - mode.dx, y: p.y - mode.dy });
    } else {
      const ax = mode.ax;
      const ay = mode.ay;
      rect = clampRect({
        x: Math.min(ax, p.x),
        y: Math.min(ay, p.y),
        w: Math.abs(p.x - ax),
        h: Math.abs(p.y - ay)
      });
    }
    onChange(rect, 'drag');
  };

  const onUp = (e: PointerEvent) => {
    if (mode.kind === 'none') return;
    mode = { kind: 'none' };
    try { el.releasePointerCapture(e.pointerId); } catch { /* released */ }
    onChange(rect, 'commit');
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return {
    get rect() { return rect; },
    set rect(r: Rect) { rect = { ...r }; },
    detach() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    }
  };
}

/* ── PNG export ────────────────────────────────────────────────────── */

/** Download the canvas's current frame as a PNG. */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename = 'tententoon.png'): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}
