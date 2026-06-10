/**
 * Experiment 06 — "Darkroom".
 *
 * Camera metaphor over the droste/tententoon engine: aim the corner-
 * bracket reticle in the viewfinder (attachRectEditor over the photo),
 * pick a lens (DROSTE / TENTENTOON), fire the shutter. Each shot
 * develops sepia→color into a filmstrip; clicking a frame opens a
 * lightbox that plays the stored scene with the stored lens.
 *
 * Canvas budget: one 2D viewfinder canvas; ONE shared offscreen GL
 * canvas (SpiralView) + ONE shared offscreen 2D canvas for thumbnails;
 * one GL + one 2D lightbox canvas (stacked, visibility-toggled).
 * A single startLoop drives everything.
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
  startLoop,
  SpiralView,
  type RectEditor,
  type Scene
} from './kit';

type Mode = 'droste' | 'tententoon';
type Shot = { id: number; scene: Scene; mode: Mode; el?: HTMLButtonElement };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const vf = $('vf');
const vfCanvas = $<HTMLCanvasElement>('vfCanvas');
const hudDims = $('hudDims');
const hudS = $('hudS');
const hudBeta = $('hudBeta');
const hudLens = $('hudLens');
const hudExp = $('hudExp');
const loadingEl = $('loading');
const lensSwitch = $('lensSwitch');
const shutterBtn = $<HTMLButtonElement>('shutter');
const counterEl = $('counter');
const glWarn = $('glWarn');
const strip = $('strip');
const stripEmpty = $('stripEmpty');
const flashEl = $('flash');
const lightbox = $('lightbox');
const lbStage = $('lbStage');
const lbGl = $<HTMLCanvasElement>('lbGl');
const lb2d = $<HTMLCanvasElement>('lb2d');
const lbCaption = $('lbCaption');

const MAX_SHOTS = 8;
const THUMB_W = 312;
const THUMB_H = 208;
const THUMB_T = 0.35;

let scene: Scene | null = null;
let mode: Mode = 'tententoon';
let editor: RectEditor | null = null;
let vfDirty = true;
let shotSerial = 0;
let openShot: Shot | null = null;
let wantPng = false;
const shots: Shot[] = [];

const pad = (n: number) => String(n).padStart(2, '0');

/* ── shared offscreen renderers (one GL context total for thumbs) ── */

const thumbGlCanvas = document.createElement('canvas');
const thumb2dCanvas = document.createElement('canvas');
let thumbView: SpiralView | null = null;
let glOk = true;
try {
  thumbView = new SpiralView(thumbGlCanvas);
} catch {
  glOk = false;
}

let lbView: SpiralView | null = null; // lazy, one context, reused forever
let lbViewFailed = false;

if (!glOk) {
  glWarn.classList.add('show');
  lensSwitch.classList.add('locked');
}

/* ── viewfinder ────────────────────────────────────────────────────── */

function getView() {
  const img = scene!.img;
  const box = vf.getBoundingClientRect();
  return fitContain(img.width, img.height, box.width, box.height);
}

function paintViewfinder(): void {
  const box = vf.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(box.width * dpr);
  const H = Math.round(box.height * dpr);
  if (vfCanvas.width !== W) vfCanvas.width = W;
  if (vfCanvas.height !== H) vfCanvas.height = H;
  const g = vfCanvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a0a0c';
  g.fillRect(0, 0, box.width, box.height);
  if (!scene) return;

  const img = scene.img;
  const fit = fitContain(img.width, img.height, box.width, box.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, fit.offX, fit.offY, fit.w, fit.h);

  // dim everything outside the reticle to 0.5
  g.fillStyle = 'rgba(6, 6, 8, 0.5)';
  g.fillRect(fit.offX, fit.offY, fit.w, fit.h);

  const r = scene.nest;
  const rx = fit.offX + r.x * fit.scale;
  const ry = fit.offY + r.y * fit.scale;
  const rw = r.w * fit.scale;
  const rh = r.h * fit.scale;

  // bright window: redraw the photo clipped to the nest rect
  g.save();
  g.beginPath();
  g.rect(rx, ry, rw, rh);
  g.clip();
  g.drawImage(img, fit.offX, fit.offY, fit.w, fit.h);
  g.restore();

  // rule-of-thirds lines, inside the rect only
  g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  g.lineWidth = 1;
  g.beginPath();
  for (const f of [1 / 3, 2 / 3]) {
    g.moveTo(rx + rw * f, ry);
    g.lineTo(rx + rw * f, ry + rh);
    g.moveTo(rx, ry + rh * f);
    g.lineTo(rx + rw, ry + rh * f);
  }
  g.stroke();

  // small center marker
  g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  g.beginPath();
  g.moveTo(rx + rw / 2 - 4, ry + rh / 2);
  g.lineTo(rx + rw / 2 + 4, ry + rh / 2);
  g.moveTo(rx + rw / 2, ry + rh / 2 - 4);
  g.lineTo(rx + rw / 2, ry + rh / 2 + 4);
  g.stroke();

  // bright corner brackets
  const L = Math.max(8, Math.min(22, rw / 3.2, rh / 3.2));
  g.strokeStyle = '#f5f5f7';
  g.lineWidth = 2;
  g.lineCap = 'square';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = 3;
  g.beginPath();
  g.moveTo(rx, ry + L); g.lineTo(rx, ry); g.lineTo(rx + L, ry);
  g.moveTo(rx + rw - L, ry); g.lineTo(rx + rw, ry); g.lineTo(rx + rw, ry + L);
  g.moveTo(rx + rw, ry + rh - L); g.lineTo(rx + rw, ry + rh); g.lineTo(rx + rw - L, ry + rh);
  g.moveTo(rx + L, ry + rh); g.lineTo(rx, ry + rh); g.lineTo(rx, ry + rh - L);
  g.stroke();
  g.shadowBlur = 0;
}

function updateHud(): void {
  if (!scene) return;
  hudDims.textContent = `${scene.img.width} × ${scene.img.height} px`;
  hudS.textContent = `S ${scene.geom.S.toFixed(2)}`;
  const beta = (Math.atan(scene.geom.ctx.logS / (2 * Math.PI)) * 180) / Math.PI;
  hudBeta.textContent = `β ${beta.toFixed(1)}°`;
  hudExp.textContent = `EXP ${pad(shotSerial)}`;
  counterEl.textContent = pad(shotSerial);
}

function reattachEditor(): void {
  editor?.detach();
  editor = null;
  if (!scene) return;
  const img = scene.img;
  editor = attachRectEditor(
    vf,
    { width: img.width, height: img.height },
    scene.nest,
    getView,
    (rect) => {
      if (!scene) return;
      scene = buildScene(scene.img, rect, scene);
      updateHud();
      vfDirty = true;
    }
  );
}

/* ── lens switch ───────────────────────────────────────────────────── */

function setMode(m: Mode): void {
  if (m === 'tententoon' && !glOk) return;
  mode = m;
  lensSwitch.dataset.mode = m;
  for (const b of lensSwitch.querySelectorAll<HTMLButtonElement>('.pos')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === m));
  }
  hudLens.textContent = `LENS · ${m}`;
}

for (const b of lensSwitch.querySelectorAll<HTMLButtonElement>('.pos')) {
  b.addEventListener('click', () => setMode(b.dataset.mode as Mode));
}
if (!glOk) setMode('droste');

/* ── shutter + filmstrip ───────────────────────────────────────────── */

function renderThumb(target: HTMLCanvasElement, s: Scene, m: Mode): void {
  const tg = target.getContext('2d');
  if (!tg) return;
  tg.fillStyle = '#000';
  tg.fillRect(0, 0, target.width, target.height);
  if (m === 'tententoon' && thumbView) {
    if (thumbGlCanvas.width !== THUMB_W) thumbGlCanvas.width = THUMB_W;
    if (thumbGlCanvas.height !== THUMB_H) thumbGlCanvas.height = THUMB_H;
    thumbView.setScene(s);
    thumbView.render({ t: THUMB_T }); // SpiralView cover-fits the crop
    tg.drawImage(thumbGlCanvas, 0, 0);
  } else {
    // drawDrosteZoom stretches to its canvas: render at crop aspect
    // sized to cover the thumb, then center-crop onto the target.
    const { crop } = s;
    const k = Math.max(THUMB_W / crop.w, THUMB_H / crop.h);
    thumb2dCanvas.width = Math.max(1, Math.round(crop.w * k));
    thumb2dCanvas.height = Math.max(1, Math.round(crop.h * k));
    drawDrosteZoom(thumb2dCanvas, s, THUMB_T);
    tg.drawImage(
      thumb2dCanvas,
      Math.round((THUMB_W - thumb2dCanvas.width) / 2),
      Math.round((THUMB_H - thumb2dCanvas.height) / 2)
    );
  }
}

function addFrame(shot: Shot): void {
  stripEmpty.classList.add('gone');
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'frame';
  el.setAttribute('aria-label', `open shot ${shot.id} (${shot.mode} lens)`);
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  renderThumb(c, shot.scene, shot.mode);
  const no = document.createElement('span');
  no.className = 'fno';
  no.textContent = `${pad(shot.id)} ${shot.mode === 'droste' ? 'D' : 'T'}`;
  el.append(c, no);
  el.addEventListener('click', () => openLightbox(shot));
  shot.el = el;
  strip.appendChild(el);
  shots.push(shot);

  if (shots.length > MAX_SHOTS) {
    const old = shots.shift();
    if (old?.el) {
      const dead = old.el;
      dead.disabled = true;
      dead.classList.add('out'); // slides shut, then leaves the DOM
      window.setTimeout(() => dead.remove(), 420);
    }
  }

  // double-rAF so the enter transition actually runs
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add('in');
      strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' });
    });
  });
}

function fireShutter(): void {
  if (!scene) return;
  flashEl.classList.remove('fire');
  void flashEl.offsetWidth; // restart the animation
  flashEl.classList.add('fire');
  shotSerial += 1;
  // `scene` is replaced (never mutated) on every edit, so storing the
  // reference snapshots the shot.
  addFrame({ id: shotSerial, scene, mode });
  updateHud();
}

shutterBtn.addEventListener('click', fireShutter);

/* ── lightbox ──────────────────────────────────────────────────────── */

function sizeLightbox(): void {
  if (!openShot) return;
  const { crop } = openShot.scene;
  const fit = fitContain(
    crop.w,
    crop.h,
    window.innerWidth * 0.88,
    window.innerHeight * 0.64
  );
  lbStage.style.width = `${Math.round(fit.w)}px`;
  lbStage.style.height = `${Math.round(fit.h)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  lb2d.width = Math.max(1, Math.round(fit.w * dpr));
  lb2d.height = Math.max(1, Math.round(fit.h * dpr));
  if (openShot.mode === 'tententoon' && lbView) lbView.autosize();
}

function openLightbox(shot: Shot): void {
  openShot = shot;
  if (shot.mode === 'tententoon' && !lbView && !lbViewFailed) {
    try {
      lbView = new SpiralView(lbGl);
    } catch {
      lbViewFailed = true;
    }
  }
  const usingGl = shot.mode === 'tententoon' && !!lbView;
  if (usingGl && lbView) lbView.setScene(shot.scene);
  lbGl.style.visibility = usingGl ? 'visible' : 'hidden';
  lb2d.style.visibility = usingGl ? 'hidden' : 'visible';
  lbCaption.textContent = `shot ${pad(shot.id)} — ${shot.mode} lens`;
  lightbox.classList.add('open');
  sizeLightbox();
  loop.t = 0;
}

function closeLightbox(): void {
  openShot = null;
  wantPng = false;
  lightbox.classList.remove('open');
}

function reshoot(): void {
  if (!openShot) return;
  const shot = openShot;
  closeLightbox();
  scene = shot.scene;
  setMode(shot.mode);
  reattachEditor();
  updateHud();
  vfDirty = true;
}

/** Render the open shot for this frame; returns the canvas that now
 *  holds fresh pixels (PNG capture must happen in the same frame). */
function renderLightbox(t: number): HTMLCanvasElement {
  const shot = openShot!;
  if (shot.mode === 'tententoon' && lbView) {
    lbView.render({ t });
    return lbGl;
  }
  drawDrosteZoom(lb2d, shot.scene, t);
  return lb2d;
}

$('lbSave').addEventListener('click', () => {
  wantPng = true;
});
$('lbReshoot').addEventListener('click', reshoot);
$('lbClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

/* ── keyboard ──────────────────────────────────────────────────────── */

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openShot) {
    closeLightbox();
    return;
  }
  const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
  if (e.key === ' ' && !openShot && !onButton) {
    e.preventDefault();
    shutterBtn.classList.add('pressed');
    window.setTimeout(() => shutterBtn.classList.remove('pressed'), 130);
    fireShutter();
  }
});

/* ── new roll (drop / paste) ───────────────────────────────────────── */

attachImageInput(document.body, (img) => {
  scene = buildScene(img, defaultNest(img));
  closeLightbox();
  reattachEditor();
  updateHud();
  vfDirty = true;
});

/* ── resize ────────────────────────────────────────────────────────── */

new ResizeObserver(() => {
  vfDirty = true;
}).observe(vf);
window.addEventListener('resize', () => {
  vfDirty = true;
  if (openShot) sizeLightbox();
});

/* ── the one rAF driver ────────────────────────────────────────────── */

const loop = startLoop(
  (t) => {
    if (openShot) {
      const c = renderLightbox(t);
      if (wantPng) {
        wantPng = false;
        downloadCanvasPng(c, `darkroom-shot-${pad(openShot.id)}-${openShot.mode}.png`);
      }
    }
    if (vfDirty) {
      vfDirty = false;
      paintViewfinder();
    }
  },
  { period: 6 }
);

/* ── boot ──────────────────────────────────────────────────────────── */

loadDemoScene()
  .then((s) => {
    scene = s;
    loadingEl.classList.add('gone');
    reattachEditor();
    updateHud();
    vfDirty = true;
  })
  .catch(() => {
    loadingEl.textContent = 'demo roll failed to load — drop a photo';
  });
