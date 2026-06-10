/**
 * Experiment 05 — "The Scroll". Scrollytelling: the page scroll IS the
 * timeline. A sticky full-viewport stage holds two stacked canvases —
 * a 2D one for the photo / Droste-dive beats and a GL SpiralView for the
 * strip / spiral beats — crossfaded as scroll progress p ∈ [0,1] walks
 * the story:
 *
 *   p 0.00–0.14  photo, plain (nest outline fades in late)
 *   p 0.14–0.32  Droste dive (t = 2 loops over the beat)
 *   p 0.32–0.50  log strip   (panV slides one full 2π period)
 *   p 0.50–0.68  the lean    (rot 0 → atan(logS/2π))
 *   p 0.68–0.86  roll it up  (unroll, morph 0 → 1)
 *   p 0.86–1.00  the spiral, free-running on time (stays in unroll@1 so
 *                the dive phase is continuous across the boundary)
 *
 * GL-mode seams are continuous by construction: log→rotlog(rot=0) differs
 * only by <1% pxPerUnit, rotlog(canonical)≡unroll(morph 0), and panU is
 * driven by the same free-running loop t in every GL beat.
 */
import {
  buildScene,
  drawDrosteZoom,
  fitContain,
  loadDemoScene,
  loadImageEl,
  startLoop,
  SpiralView,
  attachImageInput,
  DEMO_NEST,
  type Scene,
  type SpiralRenderOpts
} from './kit';

const TWO_PI = 2 * Math.PI;

/* Beat boundaries on p. */
const B1 = 0.14; // photo → dive
const B2 = 0.32; // dive → log strip
const B3 = 0.5; // log → lean
const B4 = 0.68; // lean → roll
const B5 = 0.86; // roll → free spiral
const FADE = 0.04; // half-width of the 2D↔GL crossfade (8% of p total)

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const stage = el<HTMLDivElement>('stage');
const plate = el<HTMLDivElement>('plate');
const flat = el<HTMLCanvasElement>('flat');
const spiral = el<HTMLCanvasElement>('spiral');
const glfail = el<HTMLDivElement>('glfail');
const scrim = el<HTMLDivElement>('scrim');
const title = el<HTMLElement>('title');
const progress = el<HTMLDivElement>('progress');
const betaEl = el<HTMLSpanElement>('beta');
const pickBtn = el<HTMLButtonElement>('pick');
const finale = el<HTMLElement>('finale');

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeIO = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/* ── GL view (graceful fallback) ─────────────────────────────────────── */

let view: SpiralView | null = null;
try {
  view = new SpiralView(spiral);
} catch {
  view = null;
  spiral.style.display = 'none';
}

/* ── scene + layout ──────────────────────────────────────────────────── */

let scene: Scene | null = null;
let dirty2d = true;

function layout(): void {
  const aspect = scene ? scene.crop.w / scene.crop.h : DEMO_NEST.w / DEMO_NEST.h;
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const mx = Math.max(16, Math.min(56, vw * 0.05));
  const my = Math.max(16, Math.min(64, vh * 0.07));
  const fit = fitContain(aspect, 1, vw - 2 * mx, vh - 2 * my);
  plate.style.width = `${Math.round(fit.w)}px`;
  plate.style.height = `${Math.round(fit.h)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  flat.width = Math.max(1, Math.round(fit.w * dpr));
  flat.height = Math.max(1, Math.round(fit.h * dpr));
  view?.autosize();
  dirty2d = true;
}

function setScene(s: Scene): void {
  scene = s;
  view?.setScene(s);
  const beta = Math.atan2(s.geom.ctx.logS, TWO_PI);
  betaEl.textContent = `≈ ${((beta * 180) / Math.PI).toFixed(1)}°`;
  plate.classList.add('ready');
  layout();
}

/* ── 2D beats: plain photo + Droste dive ─────────────────────────────── */

function draw2d(p: number): void {
  if (!scene) return;
  let t = 0;
  if (p > B1) t = (clamp01((p - B1) / (B2 - B1)) * 2) % 1; // two loops per beat
  drawDrosteZoom(flat, scene, t, { background: '#16120d' });

  // Nest annotation: fades in late in beat I, out early in beat II.
  // A paper veil lifts everything OUTSIDE the copy, then an accent
  // stroke marks it — figure-annotation style.
  const a =
    p <= B1
      ? smooth(0.5, 0.88, p / B1)
      : 1 - smooth(0, 0.16, (p - B1) / (B2 - B1));
  if (a <= 0) return;
  const { crop, nest } = scene;
  const kx = flat.width / crop.w;
  const ky = flat.height / crop.h;
  const ctx = flat.getContext('2d');
  if (!ctx) return;
  const x = (nest.x - crop.x) * kx;
  const y = (nest.y - crop.y) * ky;
  const w = nest.w * kx;
  const h = nest.h * ky;
  ctx.save();
  ctx.globalAlpha = a * 0.45;
  ctx.beginPath();
  ctx.rect(0, 0, flat.width, flat.height);
  ctx.rect(x, y, w, h);
  ctx.fillStyle = '#faf7f0';
  ctx.fill('evenodd');
  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(22, 18, 13, 0.6)';
  ctx.shadowBlur = flat.width / 160;
  ctx.strokeStyle = '#d94f2c';
  ctx.lineWidth = Math.max(3, flat.width / 280);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/* ── GL beats: strip → lean → roll → spiral ──────────────────────────── */

function drawGl(p: number, t: number): void {
  if (!view || !scene) return;
  const beta = Math.atan2(scene.geom.ctx.logS, TWO_PI);
  let opts: SpiralRenderOpts;
  if (p < B3) {
    // Log strip; scroll slides it one full angle-period (2π ≡ 0: seamless).
    const l = clamp01((p - B2) / (B3 - B2));
    opts = { mode: 'log', t, panV: easeIO(l) * TWO_PI };
  } else if (p < B4) {
    // The lean: rot 0 → canonical β. (log ≡ rotlog at rot 0.)
    const l = (p - B3) / (B4 - B3);
    opts = { mode: 'rotlog', t, rot: easeIO(l) * beta };
  } else {
    // Roll it up; past B5 morph stays 1 — the spiral, free-running on t.
    const l = clamp01((p - B4) / (B5 - B4));
    opts = { mode: 'unroll', t, morph: easeIO(l) };
  }
  view.render(opts);
}

/* ── the one rAF driver ──────────────────────────────────────────────── */

let lastP = -1;

function frame(t: number): void {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? clamp01(window.scrollY / max) : 0;

  progress.style.transform = `scaleX(${p})`;

  // Title + paper scrim lift away over the first beats of scroll.
  const titleA = 1 - smooth(0.015, 0.07, p);
  title.style.opacity = String(titleA);
  title.style.visibility = titleA <= 0 ? 'hidden' : 'visible';
  scrim.style.opacity = String(titleA);

  // Opening composition: plate sits low + small under the headline.
  const intro = 1 - smooth(0, 0.12, p);
  plate.style.transform =
    intro > 0.001 ? `translateY(${(intro * 10).toFixed(3)}vh) scale(${(1 - 0.08 * intro).toFixed(4)})` : '';

  // 2D ↔ GL crossfade around B2 (no CSS transition: scrub-true).
  const glA = view ? smooth(B2 - FADE, B2 + FADE, p) : 0;
  flat.style.opacity = String(1 - glA);
  if (view) spiral.style.opacity = String(glA);
  else glfail.style.opacity = String(smooth(B2 - FADE, B2 + FADE, p));

  // Finale card: anchored in the stage, scroll only fades it in.
  const fA = smooth(0.875, 0.94, p);
  finale.style.opacity = String(fA);
  finale.style.transform = `translateX(-50%) translateY(${((1 - fA) * 18).toFixed(2)}px)`;
  finale.classList.toggle('live', fA > 0.5);

  if (!scene) return;
  if (glA < 1 && (dirty2d || p !== lastP)) {
    draw2d(p);
    dirty2d = false;
  }
  if (view && glA > 0) drawGl(p, t);
  lastP = p;
}

startLoop(frame, { period: 11 });

/* ── card entrances ──────────────────────────────────────────────────── */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) e.target.classList.toggle('in', e.isIntersecting);
  },
  { threshold: 0.3 }
);
document.querySelectorAll('.track > .card').forEach((c) => io.observe(c));

/* ── bring your own picture ──────────────────────────────────────────── */

attachImageInput(document.body, (img) => setScene(buildScene(img)));

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  void loadImageEl(url).then((img) => {
    setScene(buildScene(img));
    URL.revokeObjectURL(url);
  });
});
pickBtn.addEventListener('click', () => fileInput.click());

/* ── resize ──────────────────────────────────────────────────────────── */

new ResizeObserver(() => layout()).observe(stage);
window.addEventListener('resize', layout);

/* ── go ──────────────────────────────────────────────────────────────── */

layout();
void loadDemoScene().then(setScene);
