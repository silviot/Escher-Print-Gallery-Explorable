/**
 * Experiment 03 — "The Lens".
 *
 * One surface: the photo fills the viewport, the nest rect lives ON the
 * photo, and a floating circular loupe shows the finished spiral exactly
 * where you are already looking. Drag the rect → the loupe re-renders in
 * the same input event; causality is the whole point of the page.
 */
import {
  attachImageInput,
  attachRectEditor,
  buildScene,
  defaultNest,
  downloadCanvasPng,
  drawDrosteZoom,
  fitContain,
  loadDemoScene,
  loadImageEl,
  startLoop,
  SpiralView,
  type Loop,
  type Rect,
  type RectEditor,
  type Scene
} from './kit';

const TWO_PI = Math.PI * 2;
const ACCENT = '#e8643c';
const BG = '#16161a';

const byId = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const stage = byId<HTMLDivElement>('stage');
const photoCanvas = byId<HTMLCanvasElement>('photo');
const lensEl = byId<HTMLDivElement>('lens');
const glassEl = byId<HTMLDivElement>('glass');
const loupeCanvas = byId<HTMLCanvasElement>('loupe');
const bootEl = byId<HTMLDivElement>('boot');
const fileInput = byId<HTMLInputElement>('file');

const photoCtx = photoCanvas.getContext('2d');

/* ── state ─────────────────────────────────────────────────────────── */

let scene: Scene | null = null;
let editor: RectEditor | null = null;
let view: SpiralView | null = null;
let glOk = true;
let fallbackCanvas: HTMLCanvasElement | null = null;
let loop: Loop | null = null;
let photoDirty = true;

const lens = { cx: 0, cy: 0, d: 340, targetD: 340 };

/** Slow rotation of the glass so it feels alive even when paused. */
const driftNow = (): number => ((performance.now() / 1000) * 0.05) % TWO_PI;

/* ── photo painting (2D canvas, letterboxed, dpr-crisp) ────────────── */

type View = { offX: number; offY: number; scale: number; w: number; h: number };

function currentFit(): View {
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  if (!scene) return { offX: 0, offY: 0, scale: 1, w: vw, h: vh };
  const pad = Math.min(vw, vh) > 700 ? 28 : 12;
  const f = fitContain(scene.img.width, scene.img.height, vw - pad * 2, vh - pad * 2);
  return { offX: f.offX + pad, offY: f.offY + pad, scale: f.scale, w: f.w, h: f.h };
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function paintPhoto(): void {
  if (!photoCtx) return;
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  if (vw < 1 || vh < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(vw * dpr);
  const ph = Math.round(vh * dpr);
  if (photoCanvas.width !== pw) photoCanvas.width = pw;
  if (photoCanvas.height !== ph) photoCanvas.height = ph;
  const ctx = photoCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // studio backdrop: flat dark + a barely-there center light
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, vw, vh);
  const g = ctx.createRadialGradient(vw / 2, vh * 0.42, 0, vw / 2, vh * 0.42, Math.max(vw, vh) * 0.72);
  g.addColorStop(0, 'rgba(255,255,255,0.045)');
  g.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  if (!scene) return;
  const f = currentFit();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // the print, with a soft table shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(scene.img, f.offX, f.offY, f.w, f.h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(f.offX + 0.5, f.offY + 0.5, f.w - 1, f.h - 1);

  // nest rect in screen coords
  const n = scene.nest;
  const rx = f.offX + n.x * f.scale;
  const ry = f.offY + n.y * f.scale;
  const rw = n.w * f.scale;
  const rh = n.h * f.scale;

  // dim everything outside the nest
  ctx.beginPath();
  ctx.rect(f.offX, f.offY, f.w, f.h);
  ctx.rect(rx, ry, rw, rh);
  ctx.fillStyle = 'rgba(8,8,11,0.52)';
  ctx.fill('evenodd');

  // accent frame with a quiet glow
  ctx.save();
  ctx.shadowColor = 'rgba(232,100,60,0.45)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.restore();

  // corner handles
  const hs = 10;
  for (const [cx, cy] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]] as const) {
    roundedRectPath(ctx, cx - hs / 2, cy - hs / 2, hs, hs, 2.5);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/* ── lens placement / sizing ───────────────────────────────────────── */

function clampD(d: number): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  return Math.min(Math.min(620, vmin * 0.92), Math.max(170, d));
}

function clampLensPos(): void {
  const m = lens.d * 0.28;
  lens.cx = Math.min(window.innerWidth - m, Math.max(m, lens.cx));
  lens.cy = Math.min(window.innerHeight - m, Math.max(m, lens.cy));
}

function applyLens(): void {
  const d = lens.d;
  lensEl.style.width = `${d}px`;
  lensEl.style.height = `${d}px`;
  lensEl.style.transform = `translate(${lens.cx - d / 2}px, ${lens.cy - d / 2}px)`;
}

function resizeLensCanvas(): void {
  if (view) {
    view.autosize();
    return;
  }
  if (fallbackCanvas && scene) {
    // drawDrosteZoom stretches the crop to the whole canvas; size the canvas
    // to the crop's aspect so the square glass is covered without distortion.
    const s = glassEl.clientWidth;
    const a = scene.crop.w / scene.crop.h;
    const cw = a >= 1 ? s * a : s;
    const ch = a >= 1 ? s : s / a;
    fallbackCanvas.style.left = `${(s - cw) / 2}px`;
    fallbackCanvas.style.top = `${(s - ch) / 2}px`;
    fallbackCanvas.style.width = `${cw}px`;
    fallbackCanvas.style.height = `${ch}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fallbackCanvas.width = Math.max(1, Math.round(cw * dpr));
    fallbackCanvas.height = Math.max(1, Math.round(ch * dpr));
  }
}

/** Default spot: upper-right third, never covering the initial rect
 *  (nor the title block — on phones they share the top edge). */
function placeLens(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  lens.d = lens.targetD = clampD(Math.min(340, vw * 0.58));
  const r = lens.d / 2;
  const m = 22 + r;

  type Box = { x: number; y: number; w: number; h: number; pad: number };
  const avoid: Box[] = [];
  const header = document.querySelector('header');
  const hb = header?.getBoundingClientRect();
  if (hb) avoid.push({ x: hb.left, y: hb.top, w: hb.width, h: hb.height, pad: 8 });
  if (scene) {
    const f = currentFit();
    const n = scene.nest;
    avoid.push({
      x: f.offX + n.x * f.scale,
      y: f.offY + n.y * f.scale,
      w: n.w * f.scale,
      h: n.h * f.scale,
      pad: 14
    });
  }
  const clear = ([cx, cy]: [number, number]) =>
    avoid.every((b) => {
      const nx = Math.max(b.x, Math.min(b.x + b.w, cx));
      const ny = Math.max(b.y, Math.min(b.y + b.h, cy));
      return Math.hypot(cx - nx, cy - ny) > r + b.pad;
    });
  const belowHeader = (hb ? hb.bottom + 12 : 0) + r;
  const candidates: Array<[number, number]> = [
    [vw - m, m],                  // top-right corner
    [vw - m, belowHeader],        // right edge, just under the title
    [vw - m, vh * 0.42],          // right, middle third
    [m, vh - m]                   // lower-left, last resort
  ];
  const hit = candidates.find(clear) ?? candidates[1];
  lens.cx = hit[0];
  lens.cy = hit[1];
  clampLensPos();
  applyLens();
  resizeLensCanvas();
}

/* ── rendering ─────────────────────────────────────────────────────── */

function renderLens(t: number): void {
  if (view && scene) {
    view.render({ t, panV: driftNow() });
  } else if (fallbackCanvas && scene) {
    drawDrosteZoom(fallbackCanvas, scene, t, { background: '#0c0c10' });
  }
}

/** Immediate paint — called from input handlers so the causality
 *  (drag rect → lens updates) lands inside the same event. */
function renderNow(): void {
  if (photoDirty) {
    paintPhoto();
    photoDirty = false;
  }
  renderLens(loop ? loop.t : 0);
}

/* ── scene plumbing ────────────────────────────────────────────────── */

function onRect(r: Rect, _phase: 'drag' | 'commit'): void {
  if (!scene) return;
  scene = buildScene(scene.img, r, scene);
  view?.setScene(scene);
  photoDirty = true;
  if (_phase === 'commit' && fallbackCanvas) resizeLensCanvas();
  renderNow();
}

function setImage(img: HTMLImageElement | ImageBitmap): void {
  const nest = defaultNest(img);
  scene = buildScene(img, nest);
  view?.setScene(scene);
  editor?.detach();
  editor = attachRectEditor(stage, img, nest, currentFit, onRect);
  photoDirty = true;
  if (fallbackCanvas) resizeLensCanvas();
  renderNow();
}

/* ── GL setup (with graceful 2D fallback) ──────────────────────────── */

try {
  view = new SpiralView(loupeCanvas);
} catch {
  glOk = false;
  view = null;
  loupeCanvas.remove();
  fallbackCanvas = document.createElement('canvas');
  glassEl.prepend(fallbackCanvas);
  const note = document.createElement('div');
  note.className = 'glnote';
  note.style.alignItems = 'flex-end';
  note.style.paddingBottom = '12%';
  note.innerHTML =
    '<span style="background:rgba(12,12,16,.78);padding:5px 10px;border-radius:999px;">' +
    'WebGL 2 unavailable — flat fold shown</span>';
  glassEl.insertBefore(note, byId('glare'));
}

/* ── lens interactions ─────────────────────────────────────────────── */

let lensDrag: { dx: number; dy: number } | null = null;

lensEl.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.size-btn')) return;
  e.stopPropagation();
  e.preventDefault();
  lensEl.setPointerCapture(e.pointerId);
  lensDrag = { dx: e.clientX - lens.cx, dy: e.clientY - lens.cy };
  lensEl.classList.add('dragging');
});
lensEl.addEventListener('pointermove', (e) => {
  if (!lensDrag) return;
  e.stopPropagation();
  lens.cx = e.clientX - lensDrag.dx;
  lens.cy = e.clientY - lensDrag.dy;
  clampLensPos();
  applyLens();
});
const endLensDrag = (e: PointerEvent) => {
  if (!lensDrag) return;
  lensDrag = null;
  lensEl.classList.remove('dragging');
  try { lensEl.releasePointerCapture(e.pointerId); } catch { /* gone */ }
};
lensEl.addEventListener('pointerup', endLensDrag);
lensEl.addEventListener('pointercancel', endLensDrag);

lensEl.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    lens.targetD = clampD(lens.targetD * Math.exp(-e.deltaY * 0.0016));
  },
  { passive: false }
);

for (const [id, k] of [['btn-minus', 1 / 1.22], ['btn-plus', 1.22]] as const) {
  const b = byId<HTMLButtonElement>(id);
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    lens.targetD = clampD(lens.targetD * k);
  });
}

/* ── stage hover cursor (move / resize affordance) ─────────────────── */

stage.addEventListener('pointermove', (e) => {
  if (!scene || !editor || e.buttons !== 0) return;
  const f = currentFit();
  const r = stage.getBoundingClientRect();
  const x = (e.clientX - r.left - f.offX) / f.scale;
  const y = (e.clientY - r.top - f.offY) / f.scale;
  const n = editor.rect;
  const grab = 12 / f.scale;
  const nearTL = Math.hypot(x - n.x, y - n.y) < grab;
  const nearBR = Math.hypot(x - n.x - n.w, y - n.y - n.h) < grab;
  const nearTR = Math.hypot(x - n.x - n.w, y - n.y) < grab;
  const nearBL = Math.hypot(x - n.x, y - n.y - n.h) < grab;
  stage.style.cursor =
    nearTL || nearBR ? 'nwse-resize'
    : nearTR || nearBL ? 'nesw-resize'
    : x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h ? 'move'
    : 'crosshair';
});

/* ── toolbar ───────────────────────────────────────────────────────── */

const btnPlay = byId<HTMLButtonElement>('btn-play');
const icPlay = byId<HTMLElement>('ic-play');
const icPause = byId<HTMLElement>('ic-pause');
btnPlay.addEventListener('click', () => {
  if (!loop) return;
  loop.toggle();
  icPlay.hidden = loop.playing;
  icPause.hidden = !loop.playing;
  btnPlay.setAttribute('aria-label', loop.playing ? 'pause' : 'play');
});

const btn4 = byId<HTMLButtonElement>('btn-4s');
const btn8 = byId<HTMLButtonElement>('btn-8s');
const setPeriod = (p: number) => {
  if (loop) loop.period = p;
  btn4.classList.toggle('active', p === 4);
  btn8.classList.toggle('active', p === 8);
};
btn4.addEventListener('click', () => setPeriod(4));
btn8.addEventListener('click', () => setPeriod(8));

byId<HTMLButtonElement>('btn-save').addEventListener('click', () => {
  // GL buffer is not preserved: render synchronously, then capture.
  renderLens(loop ? loop.t : 0);
  const c = view ? view.canvas : fallbackCanvas;
  if (c) downloadCanvasPng(c, 'tententoon-print.png');
});

byId<HTMLButtonElement>('btn-photo').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (!f || !f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  void loadImageEl(url).then((img) => {
    setImage(img);
    URL.revokeObjectURL(url);
  });
  fileInput.value = '';
});

attachImageInput(document.body, setImage);

/* ── resize ────────────────────────────────────────────────────────── */

window.addEventListener('resize', () => {
  photoDirty = true;
  lens.targetD = clampD(lens.targetD);
  lens.d = clampD(lens.d);
  clampLensPos();
  applyLens();
  resizeLensCanvas();
});

/* ── boot ──────────────────────────────────────────────────────────── */

loop = startLoop(
  (t) => {
    // smooth lens resizing (wheel / +/- ease toward targetD)
    if (Math.abs(lens.targetD - lens.d) > 0.4) {
      lens.d += (lens.targetD - lens.d) * 0.22;
      if (Math.abs(lens.targetD - lens.d) <= 0.4) lens.d = lens.targetD;
      clampLensPos();
      applyLens();
      resizeLensCanvas();
    }
    if (photoDirty && scene) {
      paintPhoto();
      photoDirty = false;
    }
    renderLens(t);
  },
  { period: 8, autoplay: true }
);

loadDemoScene()
  .then((s) => {
    scene = s;
    view?.setScene(s);
    editor = attachRectEditor(stage, s.img, s.nest, currentFit, onRect);
    placeLens();
    paintPhoto();
    photoDirty = false;
    renderLens(0);
    lensEl.classList.add('ready');
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 600);
  })
  .catch(() => {
    const bl = bootEl.querySelector<HTMLElement>('.bl');
    if (bl) bl.textContent = 'couldn’t load the demo photo — drop one anywhere to start.';
    bootEl.querySelector<HTMLElement>('.ring')?.remove();
    bootEl.style.background = 'transparent';
    bootEl.style.pointerEvents = 'none';
  });
