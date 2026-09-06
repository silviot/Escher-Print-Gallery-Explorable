import './essay.css';
import { SpiralView } from './view';
import { buildScene, drawDrosteZoom, loadDemoScene, loadImageEl, publicAssetUrl, DEMO_IMAGE_PLAIN, type Scene } from '../experiments/kit';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const heroOriginal = $<HTMLCanvasElement>('hero-original');
const heroCanvas = $<HTMLCanvasElement>('hero-spiral');
const copyCanvas = $<HTMLCanvasElement>('copies');
const wrapCanvas = $<HTMLCanvasElement>('wrap');
const heroZoom = $<HTMLInputElement>('hero-zoom');
const copyCount = $<HTMLInputElement>('copy-count');
const rulerChange = $<HTMLInputElement>('ruler-change');
const transformation = $<HTMLInputElement>('transformation');
const heroPlay = $<HTMLButtonElement>('hero-play');
const wrapPlay = $<HTMLButtonElement>('wrap-play');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroView = new SpiralView(heroCanvas);
const wrapView = new SpiralView(wrapCanvas);
let scene: Scene | null = null;
let plainScene: Scene | null = null;
let heroPhase = 0;
let wrapPhase = 0;
let heroPlaying = false;
let wrapPlaying = false;
let heroVisible = false;
let wrapVisible = false;
let frameId = 0;
let lastFrame = 0;
let lastPaint = 0;

function progress(input: HTMLInputElement): void {
  input.style.setProperty('--range', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
}

function size2d(canvas: HTMLCanvasElement, aspect?: number): void {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round((aspect ? box.width / aspect : box.height) * dpr));
}

function paintHero(): void {
  if (!scene) return;
  drawDrosteZoom(heroOriginal, scene, heroPhase);
  heroView.render({ mode: 'unroll', morph: 1, t: heroPhase });
  $('hero-output').textContent = `${Math.round(heroPhase * 100)}%`;
  heroZoom.value = String(heroPhase * 100);
  progress(heroZoom);
}

function paintCopies(): void {
  if (!plainScene) return;
  const n = Number(copyCount.value);
  const { img, crop, nest } = plainScene;
  const ctx = copyCanvas.getContext('2d');
  if (!ctx) return;
  const ratio = nest.w / crop.w;
  const offsetX = nest.x - crop.x;
  const offsetY = nest.y - crop.y;
  ctx.setTransform(copyCanvas.width / crop.w, 0, 0, copyCanvas.height / crop.h, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let x = 0, y = 0, scale = 1;
  for (let i = 0; i <= n; i++) {
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, x, y, crop.w * scale, crop.h * scale);
    x += offsetX * scale;
    y += offsetY * scale;
    scale *= ratio;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  $('copies-output').textContent = n === 0 ? 'Empty frame' : `${n} ${n === 1 ? 'copy' : 'copies'}`;
  progress(copyCount);
}

function paintRuler(): void {
  const p = Number(rulerChange.value) / 100;
  const ratio = scene ? 1 / scene.geom.S : 0.46;
  const left = 68, right = 650, width = right - left;
  const nMax = 4;
  const labelSize = window.innerWidth <= 520 ? 20 : 13;
  const captionSize = window.innerWidth <= 520 ? 20 : 16;
  let drawing = '<line x1="52" y1="158" x2="670" y2="158" stroke="#cbd2c2" stroke-width="1.5"/>';
  const colors = ['#365b46', '#658261', '#91a281', '#b8bf9e', '#d1ceb0'];
  for (let n = 0; n <= nMax; n++) {
    // Radius r_n = r_0 / S^n; after normalizing its range, -ln(r_n)
    // is exactly n / nMax. The interpolation only changes the ruler.
    const ordinary = (1 - Math.pow(ratio, n)) / (1 - Math.pow(ratio, nMax));
    const x = left + width * ((1 - p) * ordinary + p * n / nMax);
    const radius = 22 * Math.pow(ratio, n * .44) + 5;
    const labelY = n === 3 && p < .6 ? 74 - p * 35 : 52;
    drawing += `<line x1="${x}" y1="${labelY + 13}" x2="${x}" y2="${158 - radius - 7}" stroke="${colors[n]}" stroke-width="1"/><circle cx="${x}" cy="158" r="${radius}" fill="${colors[n]}" stroke="#f0f1e9" stroke-width="3"/><text x="${x}" y="${labelY}" text-anchor="middle" fill="#53624c" font-family="system-ui,sans-serif" font-size="${labelSize}">${n === 0 ? 'Original' : `Copy ${n}`}</text>`;
    if (p > .5 && n < nMax) {
      const nextOrdinary = (1 - Math.pow(ratio, n + 1)) / (1 - Math.pow(ratio, nMax));
      const nextX = left + width * ((1 - p) * nextOrdinary + p * (n + 1) / nMax);
      drawing += `<path d="M ${x + 5} 212 V 217 H ${nextX - 5} V 212" fill="none" stroke="#91a281" stroke-width="1" opacity="${(p - .5) * 2}"/>`;
    }
  }
  drawing += `<text x="360" y="254" text-anchor="middle" fill="#6a7761" font-family="Georgia,serif" font-size="${captionSize}">${p < .5 ? 'Same proportion. Smaller and smaller gaps.' : 'Same proportion. The same distance on a new ruler.'}</text>`;
  document.getElementById('ruler-drawing')!.innerHTML = drawing;
  $('ruler-output').textContent = p === 0 ? 'Ordinary distance' : p === 1 ? 'Logarithmic distance' : `${Math.round(p * 100)}% of the way`;
  $('ruler-caption').textContent = p < .5
    ? 'The dots mark the same feature in five successive copies. Notice how they bunch up.'
    : 'The pictures still shrink. The new ruler gives each equal change in proportion an equal amount of room.';
  progress(rulerChange);
}

function paintWrap(): void {
  if (!scene) return;
  const p = Number(transformation.value) / 100;
  const beta = Math.atan2(scene.geom.ctx.logS, 2 * Math.PI);
  if (p <= .3) wrapView.render({ mode: 'rotlog', t: wrapPhase, rot: beta * p / .3 });
  else wrapView.render({ mode: 'unroll', t: wrapPhase, morph: (p - .3) / .7 });
}

function updateWrap(): void {
  const p = Number(transformation.value) / 100;
  const beta = scene ? Math.atan2(scene.geom.ctx.logS, 2 * Math.PI) * 180 / Math.PI : 7;
  const active = p === 0 ? 0 : p <= .3 ? 30 : 100;
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => {
    const selected = Number(button.dataset.stage) === active;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('wrap-output').textContent = p === 0 ? 'Flat picture' : p <= .3 ? `Tilt ${(beta * p / .3).toFixed(1)}°` : p === 1 ? 'A continuous spiral' : `Wrapped ${Math.round((p - .3) / .7 * 100)}%`;
  $('wrap-caption').textContent = p === 0
    ? 'The photograph becomes a repeating map of distance and angle. Take the slider slowly to the right.'
    : p <= .3
      ? `A tilt of ${beta.toFixed(1)}° couples a full turn around the center to one repeat across the picture.`
      : p < 1
        ? 'The map curls back around the center. Follow a single frame as it bends.'
        : 'The frames now join a spiral. Press “Let it move” and follow one inward.';
  progress(transformation);
  paintWrap();
}

function buttons(): void {
  heroPlay.innerHTML = heroPlaying ? '<span aria-hidden="true">Ⅱ</span> Pause the zoom' : '<span aria-hidden="true">▶</span> Play the zoom';
  heroPlay.setAttribute('aria-pressed', String(heroPlaying));
  wrapPlay.innerHTML = wrapPlaying ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Let it move';
  wrapPlay.setAttribute('aria-pressed', String(wrapPlaying));
}

function shouldAnimate(): boolean {
  return !document.hidden && !!scene && ((heroPlaying && heroVisible) || (wrapPlaying && wrapVisible));
}

function tick(now: number): void {
  frameId = 0;
  if (!shouldAnimate()) return;
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;
  lastFrame = now;
  if (heroPlaying && heroVisible) heroPhase = (heroPhase + elapsed / 13) % 1;
  if (wrapPlaying && wrapVisible) wrapPhase = (wrapPhase + elapsed / 13) % 1;
  if (now - lastPaint > 1000 / 30) {
    if (heroPlaying && heroVisible) paintHero();
    if (wrapPlaying && wrapVisible) paintWrap();
    lastPaint = now;
  }
  frameId = requestAnimationFrame(tick);
}

function schedule(): void {
  if (shouldAnimate() && !frameId) { lastFrame = 0; frameId = requestAnimationFrame(tick); }
  if (!shouldAnimate() && frameId) { cancelAnimationFrame(frameId); frameId = 0; lastFrame = 0; }
}

heroZoom.addEventListener('input', () => {
  heroPlaying = false;
  heroPhase = Number(heroZoom.value) / 100;
  buttons(); paintHero(); schedule();
});
copyCount.addEventListener('input', paintCopies);
rulerChange.addEventListener('input', paintRuler);
transformation.addEventListener('input', updateWrap);
heroPlay.addEventListener('click', () => { heroPlaying = !heroPlaying; buttons(); schedule(); });
wrapPlay.addEventListener('click', () => { wrapPlaying = !wrapPlaying; buttons(); schedule(); });
document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => button.addEventListener('click', () => {
  transformation.value = button.dataset.stage!;
  updateWrap();
}));

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target.id === 'hero-figure') heroVisible = entry.isIntersecting;
    if (entry.target.id === 'wrap-figure') wrapVisible = entry.isIntersecting;
  }
  schedule();
}, { threshold: .08 });
observer.observe($('hero-figure'));
observer.observe($('wrap-figure'));
document.addEventListener('visibilitychange', schedule);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { heroPlaying = false; wrapPlaying = false; buttons(); schedule(); }
});

function resize(): void {
  size2d(heroOriginal, scene ? scene.crop.w / scene.crop.h : 1.28);
  size2d(copyCanvas);
  heroView.autosize(1.5);
  wrapView.autosize(1.5);
  paintHero(); paintCopies(); paintWrap(); paintRuler();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(heroCanvas);
resizeObserver.observe(copyCanvas);
resizeObserver.observe(wrapCanvas);
paintRuler();
progress(copyCount);
progress(transformation);

void Promise.all([
  loadDemoScene(),
  loadImageEl(publicAssetUrl(DEMO_IMAGE_PLAIN))
]).then(([demo, plain]) => {
  scene = demo;
  plainScene = buildScene(plain, { x: 339, y: 329, w: 591, h: 462 });
  heroView.setScene(demo);
  wrapView.setScene(demo);
  const beta = Math.atan2(demo.geom.ctx.logS, 2 * Math.PI) * 180 / Math.PI;
  $('shrink-fraction').textContent = `${Math.round(100 / demo.geom.S)}%`;
  $('tilt-value').textContent = `${beta.toFixed(1)}°`;
  $('load-status').textContent = '';
  resize(); paintRuler(); updateWrap(); schedule();
}).catch(error => {
  console.error('The essay photographs could not be loaded.', error);
  $('load-status').textContent = 'The photographs could not load. Reload the page to try again; the ruler below still works.';
});

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  cancelAnimationFrame(frameId);
  observer.disconnect();
  resizeObserver.disconnect();
  heroView.dispose();
  wrapView.dispose();
});
