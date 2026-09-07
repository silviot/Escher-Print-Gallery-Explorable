/**
 * Experiment 02 — "Three Steps": a full-screen wizard over the engine.
 * One decision per screen: picture → frame → loop. The conversion frame:
 * every screen has exactly one obvious primary action.
 */
import {
  attachImageInput,
  attachRectEditor,
  buildScene,
  downloadCanvasPng,
  drawDrosteZoom,
  fitContain,
  loadDemoScene,
  startLoop,
  SpiralView,
  type RectEditor,
  type Scene
} from './kit';

/* ── DOM ───────────────────────────────────────────────────────────── */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const app = $('app');
const track = $('track');
const screens = [$('s1'), $('s2'), $('s3')];
const psteps = [$('ps0'), $('ps1'), $('ps2')] as HTMLButtonElement[];
const drop = $('drop');
const demoBtn = $<HTMLButtonElement>('demoBtn');
const thumbCanvas = $<HTMLCanvasElement>('thumbCanvas');
const stageWrap = $('stageWrap');
const stageCanvas = $<HTMLCanvasElement>('stageCanvas');
const previewCanvas = $<HTMLCanvasElement>('previewCanvas');
const fallCanvas = $<HTMLCanvasElement>('fallCanvas');
const glCanvas = $<HTMLCanvasElement>('glCanvas');
const canvasStack = $('canvasStack');
const seg = $('seg');
const segPill = $('segPill');

/* ── state ─────────────────────────────────────────────────────────── */
let scene: Scene | null = null;
let demoScene: Scene | null = null;
let step = 0;
let mode: 'fall' | 'spiral' = 'spiral';
let fadeEnd = 0; // render both layers until this clock during crossfades
let editor: RectEditor | null = null;

/* ── GL views (graceful no-WebGL2 path) ────────────────────────────── */
let thumbView: SpiralView | null = null;
let previewView: SpiralView | null = null;
let mainView: SpiralView | null = null;
try {
  thumbView = new SpiralView(thumbCanvas);
  previewView = new SpiralView(previewCanvas);
  mainView = new SpiralView(glCanvas);
} catch {
  thumbView = previewView = mainView = null;
  app.classList.add('no-gl');
  mode = 'fall';
}

/* ── screen 2: stage painting (photo + dim + rect + handles) ───────── */
const ACCENT = '#d94f2c';

function stageView() {
  const r = stageWrap.getBoundingClientRect();
  const s = scene!;
  const f = fitContain(s.img.width, s.img.height, r.width, r.height);
  return { offX: f.offX, offY: f.offY, scale: f.scale, boxW: r.width, boxH: r.height };
}

function paintStage(): void {
  if (!scene) return;
  const v = stageView();
  if (v.boxW < 2 || v.boxH < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(v.boxW * dpr);
  const H = Math.round(v.boxH * dpr);
  if (stageCanvas.width !== W) stageCanvas.width = W;
  if (stageCanvas.height !== H) stageCanvas.height = H;
  const ctx = stageCanvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.boxW, v.boxH);

  const s = scene;
  const pw = s.img.width * v.scale;
  const ph = s.img.height * v.scale;
  // photo, with a soft lift off the paper
  ctx.save();
  ctx.shadowColor = 'rgba(33, 28, 22, 0.28)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff';
  ctx.fillRect(v.offX, v.offY, pw, ph);
  ctx.restore();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.img, v.offX, v.offY, pw, ph);

  // dim everything outside the nest
  const n = s.nest;
  const nx = v.offX + n.x * v.scale;
  const ny = v.offY + n.y * v.scale;
  const nw = n.w * v.scale;
  const nh = n.h * v.scale;
  const ellipseNest = s.geom.ctx.shapeMorph === 0;
  const traceNest = () => {
    if (ellipseNest) {
      ctx.moveTo(nx + nw, ny + nh / 2);
      ctx.ellipse(nx + nw / 2, ny + nh / 2, nw / 2, nh / 2, 0, 0, Math.PI * 2);
    } else ctx.rect(nx, ny, nw, nh);
  };
  ctx.beginPath();
  ctx.rect(v.offX, v.offY, pw, ph);
  traceNest();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill('evenodd');

  // accent border + corner handles
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  traceNest();
  ctx.stroke();
  const corners: Array<[number, number]> = [
    [nx, ny], [nx + nw, ny], [nx, ny + nh], [nx + nw, ny + nh]
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fffdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();
  }
}

function makeEditor(): void {
  editor?.detach();
  const s = scene!;
  editor = attachRectEditor(
    stageWrap,
    s.img,
    s.nest,
    () => stageView(),
    (rect) => {
      // cheap rebuild — pixel extraction is reused via the previous scene
      scene = buildScene(s.img, rect, scene ?? undefined);
      previewView?.setScene(scene);
      mainView?.setScene(scene);
      paintStage();
    }
  );
}

// hover cursor feedback (move / resize / draw) when not dragging
stageWrap.addEventListener('pointermove', (e) => {
  if (!scene || e.buttons !== 0) return;
  const v = stageView();
  const r = stageWrap.getBoundingClientRect();
  const x = (e.clientX - r.left - v.offX) / v.scale;
  const y = (e.clientY - r.top - v.offY) / v.scale;
  const n = scene.nest;
  const grab = 12 / v.scale;
  const nearTL = Math.hypot(x - n.x, y - n.y) < grab;
  const nearBR = Math.hypot(x - n.x - n.w, y - n.y - n.h) < grab;
  const nearTR = Math.hypot(x - n.x - n.w, y - n.y) < grab;
  const nearBL = Math.hypot(x - n.x, y - n.y - n.h) < grab;
  let cur = 'crosshair';
  if (nearTL || nearBR) cur = 'nwse-resize';
  else if (nearTR || nearBL) cur = 'nesw-resize';
  else if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) cur = 'move';
  stageWrap.style.cursor = cur;
});

/* ── screen 3: full-bleed canvases ─────────────────────────────────── */
function sizeStep3(): void {
  if (!scene) return;
  const r = canvasStack.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  mainView?.autosize();
  // The 2D fall canvas must keep the crop's aspect (drawDrosteZoom maps
  // crop → full canvas), so cover-fit a crop-aspect box over the screen.
  const c = scene.crop;
  const k = Math.max(r.width / c.w, r.height / c.h);
  const cssW = c.w * k;
  const cssH = c.h * k;
  fallCanvas.style.width = `${cssW}px`;
  fallCanvas.style.height = `${cssH}px`;
  fallCanvas.style.left = `${(r.width - cssW) / 2}px`;
  fallCanvas.style.top = `${(r.height - cssH) / 2}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 2400 / Math.max(cssW, cssH));
  fallCanvas.width = Math.max(2, Math.round(cssW * dpr));
  fallCanvas.height = Math.max(2, Math.round(cssH * dpr));
}

function renderFall(t: number): void {
  if (scene) drawDrosteZoom(fallCanvas, scene, t, { background: '#15110b' });
}

function setMode(m: 'fall' | 'spiral', animate = true): void {
  if (!mainView) m = 'fall';
  mode = m;
  fadeEnd = animate ? performance.now() + 420 : 0;
  screens[2].classList.toggle('mode-fall', m === 'fall');
  for (const b of seg.querySelectorAll('button')) {
    const on = b.dataset.mode === m;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  placeSegPill();
  // paint the incoming layer immediately so the crossfade never shows a stale frame
  if (m === 'fall' || fadeEnd) renderFall(loop.t);
  if (m === 'spiral') mainView?.render({ t: loop.t });
}

function placeSegPill(): void {
  const on = seg.querySelector<HTMLButtonElement>('button.on');
  if (!on) return;
  segPill.style.left = `${on.offsetLeft}px`;
  segPill.style.width = `${on.offsetWidth}px`;
}

seg.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  const m = b?.dataset.mode;
  if (m === 'fall' || m === 'spiral') setMode(m);
});

/* ── one rAF driver ────────────────────────────────────────────────── */
const loop = startLoop(
  (t) => {
    if (step === 0) {
      if (demoScene) thumbView?.render({ t });
    } else if (step === 1) {
      if (scene) previewView?.render({ t });
    } else {
      const now = performance.now();
      const fading = now < fadeEnd;
      if (mainView && (mode === 'spiral' || fading)) mainView.render({ t });
      if (!mainView || mode === 'fall' || fading) renderFall(t);
    }
  },
  { period: 6 }
);

/* ── navigation ────────────────────────────────────────────────────── */
function updateProgress(): void {
  psteps.forEach((b, i) => {
    b.classList.toggle('now', i === step);
    b.classList.toggle('done', i < step);
    b.disabled = i !== 0 && !scene;
  });
}

function go(n: number): void {
  if (n === step || (n > 0 && !scene)) return;
  // Drop focus from whatever button triggered the transition: it is now
  // offscreen, and a focused button would swallow the Enter shortcut via
  // native activation (re-firing its click and resetting the framing).
  (document.activeElement as HTMLElement | null)?.blur?.();
  step = n;
  track.style.transform = `translateX(${-n * 100}vw)`;
  screens.forEach((s, i) => s.classList.toggle('is-active', i === n));
  updateProgress();
  if (n === 1) {
    previewView?.autosize();
    paintStage();
    previewView?.render({ t: loop.t });
  }
  if (n === 2) {
    sizeStep3();
    if (mode === 'fall' || !mainView) renderFall(loop.t);
    else mainView.render({ t: loop.t });
    placeSegPill();
  }
}

function adoptScene(s: Scene): void {
  scene = s;
  previewView?.setScene(s);
  mainView?.setScene(s);
  makeEditor();
  paintStage();
  updateProgress();
}

/* ── inputs ────────────────────────────────────────────────────────── */
attachImageInput(
  drop,
  (img) => {
    adoptScene(buildScene(img)); // centred default nest
    go(1);
  },
  { click: true }
);
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    drop.click();
  }
});

const demoReady = loadDemoScene()
  .then((s) => {
    demoScene = s;
    thumbView?.setScene(s);
    if (thumbView?.autosize()) {
      thumbView.render({ t: 0 });
      thumbCanvas.classList.add('ready');
    }
    return s;
  })
  .catch(() => null);

demoBtn.addEventListener('click', async () => {
  const s = demoScene ?? (await demoReady);
  if (!s) return;
  // fresh copy so "start over → demo" always begins from the known-good nest
  adoptScene(buildScene(s.img, { ...s.nest }, s));
  go(1);
});

$('back2').addEventListener('click', () => go(0));
$('back3').addEventListener('click', () => go(1));
$('spiralBtn').addEventListener('click', () => go(2));
$('adjustBtn').addEventListener('click', () => go(1));
$('startOver').addEventListener('click', () => {
  scene = null;
  editor?.detach();
  editor = null;
  go(0);
  updateProgress();
});
$('saveBtn').addEventListener('click', () => {
  if (!scene) return;
  if (mode === 'spiral' && mainView) {
    mainView.render({ t: loop.t }); // fresh frame in this task → toBlob sees it
    downloadCanvasPng(glCanvas, 'tententoon-spiral.png');
  } else {
    renderFall(loop.t);
    downloadCanvasPng(fallCanvas, 'tententoon-straight-fall.png');
  }
});
for (const b of psteps) {
  b.addEventListener('click', () => go(Number(b.dataset.step)));
}

window.addEventListener('keydown', (e) => {
  const ae = document.activeElement;
  if (e.key === 'Enter') {
    if (ae instanceof HTMLElement && (ae.tagName === 'BUTTON' || ae.tagName === 'A' || ae.id === 'drop')) return;
    if (step === 0 && scene) go(1);
    else if (step === 1) go(2);
    else if (step === 2) $('saveBtn').click();
  } else if (e.key === 'Escape') {
    if (step > 0) go(step - 1);
  }
});

/* ── resize ────────────────────────────────────────────────────────── */
const onResize = () => {
  thumbView?.autosize();
  previewView?.autosize();
  if (scene) {
    paintStage();
    sizeStep3();
  }
  placeSegPill();
};
window.addEventListener('resize', onResize);
new ResizeObserver(() => {
  if (scene && step === 1) paintStage();
}).observe(stageWrap);
new ResizeObserver(() => {
  if (scene && step === 2) sizeStep3();
}).observe(canvasStack);

/* ── first paint ───────────────────────────────────────────────────── */
placeSegPill();
