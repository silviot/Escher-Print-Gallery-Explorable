import './inside.css';
import { drawDrosteZoom, type Scene } from '../experiments/kit';
import { SpiralView, createGalleryScene } from './view';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const flat = el<HTMLCanvasElement>('flat-canvas');
const transformed = el<HTMLCanvasElement>('transform-canvas');
const heroCanvas = el<HTMLCanvasElement>('hero-canvas');
const visualColumn = el('visual-column');
const stage = el('stage');
const chapters = [...document.querySelectorAll<HTMLElement>('.chapter')];
const chapterLinks = [...document.querySelectorAll<HTMLAnchorElement>('.chapter-nav a')];
const controls = ['copies', 'slide', 'tilt', 'roll', 'depth'].map(id => el<HTMLInputElement>(id));
const outputs = ['copies', 'slide', 'tilt', 'roll', 'depth'].map(id => el<HTMLOutputElement>(`${id}-value`));
const heroPlay = el<HTMLButtonElement>('hero-play');
const stagePlay = el<HTMLButtonElement>('stage-play');
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const stageNames = ['A picture inside a picture', 'Scale becomes distance', 'One turn, one smaller copy', 'A tilt becomes a twist', 'Here, again'];
const captions = [
  'The little frame is where the whole picture goes.',
  'The same picture, opened into a repeating strip.',
  'A full turn now leads to the next smaller copy.',
  'The flat map returns to the plane of the picture.',
  'Follow the same room through another turn.'
];

let scene: Scene | null = null;
let mainView: SpiralView | null = null;
let heroView: SpiralView | null = null;
let active = 0;
let sectionProgress = 0;
let phase = 0;
let heroPhase = .28;
let playing = false;
let heroPlaying = false;
let zoomedCopies = false;
let stageVisible = false;
let heroVisible = true;
let manual: (number | null)[] = [null, null, null, null, null];
let raf = 0;
let lastTime = 0;
let dirtyMain = true;
let dirtyHero = true;
let scrollDirty = true;
let beta = 0;

function requestFrame() {
  if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
}

function updatePlayButtons() {
  heroPlay.innerHTML = heroPlaying ? 'Pause the loop <span aria-hidden="true">Ⅱ</span>' : 'Play the loop <span aria-hidden="true">▷</span>';
  heroPlay.setAttribute('aria-pressed', String(heroPlaying));
  stagePlay.innerHTML = playing ? 'Pause zoom <span aria-hidden="true">Ⅱ</span>' : 'Play zoom <span aria-hidden="true">▷</span>';
  stagePlay.setAttribute('aria-pressed', String(playing));
}

function currentValue(index: number): number {
  return manual[index] ?? (reduceMotion.matches ? [.75, 0, 1, 1, 0][index] : sectionProgress);
}

function updateControl(index: number) {
  const value = currentValue(index);
  const raw = index === 0 ? Math.round(value * 8) : value * 100;
  controls[index].value = String(raw);
  controls[index].style.setProperty('--fill', `${index === 0 ? raw / 8 * 100 : raw}%`);
  outputs[index].textContent = index === 0 ? `${raw} ${raw === 1 ? 'copy' : 'copies'}` : index === 2 ? `${(value * beta * 180 / Math.PI).toFixed(1)}°` : `${Math.round(raw)}%`;
  controls[index].setAttribute('aria-valuetext', outputs[index].textContent!);
}

function readScroll() {
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const focus = mobile ? visualColumn.getBoundingClientRect().height + 115 : window.innerHeight * .48;
  let next = 0;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].getBoundingClientRect().top <= focus) next = i;
  }
  const rect = chapters[next].getBoundingClientRect();
  const progress = clamp((focus - rect.top) / Math.max(1, rect.height * .74));
  if (next !== active) {
    active = next;
    playing = false;
    zoomedCopies = false;
    phase = 0;
    updatePlayButtons();
    el('stage-number').textContent = `0${active + 1} / 05`;
    el('stage-name').textContent = stageNames[active];
    el('stage-caption').textContent = captions[active];
    chapterLinks.forEach((link, index) => index === active ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    dirtyMain = true;
  }
  if (progress !== sectionProgress) {
    sectionProgress = progress;
    if (manual[active] === null || active === 1) dirtyMain = true;
  }
  updateControl(active);
}

function drawCopies(copies: number) {
  if (!scene) return;
  const ctx = flat.getContext('2d');
  if (!ctx) return;
  const { img, crop, nest } = scene;
  const width = flat.width;
  const height = flat.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#222927';
  ctx.fillRect(0, 0, width, height);
  let x = 0, y = 0, w = width, h = height;
  const dx = (nest.x - crop.x) / crop.w;
  const dy = (nest.y - crop.y) / crop.h;
  const scaleX = nest.w / crop.w;
  const scaleY = nest.h / crop.h;
  for (let i = 0; i <= copies; i++) {
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, x, y, w, h);
    x += w * dx;
    y += h * dy;
    w *= scaleX;
    h *= scaleY;
  }
  if (copies < 2) {
    ctx.strokeStyle = '#f2ba87';
    ctx.lineWidth = Math.max(1.5, width / 350);
    ctx.strokeRect(dx * width, dy * height, scaleX * width, scaleY * height);
  }
}

function renderMain() {
  if (!scene || !mainView) return;
  const value = currentValue(active);
  const copiesView = active === 0;
  flat.hidden = !copiesView;
  transformed.hidden = copiesView;
  el('stage-mark').hidden = active !== 0 || zoomedCopies || value > .25;
  if (copiesView) {
    if (zoomedCopies) drawDrosteZoom(flat, scene, phase, { background: '#222927' });
    else drawCopies(Math.round(value * 8));
  } else if (active === 1) {
    mainView.render({ mode: 'unroll', morph: reduceMotion.matches ? 0 : 1 - sectionProgress, rot: 0, twist: 0, t: value + phase });
  } else if (active === 2) {
    mainView.render({ mode: 'rotlog', rot: beta * value, t: phase });
  } else if (active === 3) {
    mainView.render({ mode: 'unroll', morph: value, t: phase });
  } else {
    mainView.render({ mode: 'unroll', morph: 1, t: value + phase });
  }
}

function frame(now: number) {
  raf = 0;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0;
  lastTime = now;
  if (scrollDirty) { readScroll(); scrollDirty = false; }
  if (stageVisible && playing) { phase = (phase + dt / 10) % 1; dirtyMain = true; }
  if (heroVisible && heroPlaying) { heroPhase = (heroPhase + dt / 12) % 1; dirtyHero = true; }
  if (scene) {
    if (dirtyMain && stageVisible) { renderMain(); dirtyMain = false; }
    if (dirtyHero && heroVisible) { heroView?.render({ t: heroPhase }); dirtyHero = false; }
  }
  if ((stageVisible && playing) || (heroVisible && heroPlaying)) requestFrame();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (flat.width !== width || flat.height !== height) { flat.width = width; flat.height = height; }
  // Both renderers must be sized even while their corresponding canvas is hidden.
  // Use the stage bounds directly; autosize cannot measure a display:none canvas.
  const fallbackScale = transformed.dataset.renderer === 'cpu' ? Math.min(1, 420 / Math.max(width, height)) : 1;
  const transformWidth = Math.max(1, Math.round(width * fallbackScale));
  const transformHeight = Math.max(1, Math.round(height * fallbackScale));
  if (transformed.width !== transformWidth || transformed.height !== transformHeight) {
    transformed.width = transformWidth;
    transformed.height = transformHeight;
  }
  heroView?.autosize(1.5);
  dirtyMain = true;
  dirtyHero = true;
  scrollDirty = true;
  requestFrame();
}

controls.forEach((control, index) => {
  control.addEventListener('input', () => {
    manual[index] = Number(control.value) / (index === 0 ? 8 : 100);
    if (active !== index) {
      active = index;
      el('stage-number').textContent = `0${active + 1} / 05`;
      el('stage-name').textContent = stageNames[active];
      el('stage-caption').textContent = captions[active];
      chapterLinks.forEach((link, i) => i === active ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    }
    playing = false;
    zoomedCopies = false;
    phase = 0;
    updatePlayButtons();
    updateControl(index);
    dirtyMain = true;
    requestFrame();
  });
});

heroPlay.addEventListener('click', () => {
  heroPlaying = !heroPlaying;
  lastTime = 0;
  updatePlayButtons();
  requestFrame();
});

stagePlay.addEventListener('click', () => {
  playing = !playing;
  if (active === 0) zoomedCopies = true;
  lastTime = 0;
  updatePlayButtons();
  dirtyMain = true;
  requestFrame();
});

chapterLinks.forEach((link, index) => link.addEventListener('click', () => {
  manual[index] = null;
  playing = false;
  updatePlayButtons();
}));

window.addEventListener('scroll', () => {
  scrollDirty = true;
  requestFrame();
}, { passive: true });

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target === visualColumn) {
      stageVisible = entry.isIntersecting;
      if (!stageVisible) { playing = false; updatePlayButtons(); }
    } else {
      heroVisible = entry.isIntersecting;
      if (!heroVisible) { heroPlaying = false; updatePlayButtons(); }
    }
  }
  lastTime = 0;
  requestFrame();
}, { threshold: 0.01 });
observer.observe(visualColumn);
observer.observe(el('opening-art'));

new ResizeObserver(resize).observe(stage);
new ResizeObserver(resize).observe(heroCanvas);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    playing = false;
    heroPlaying = false;
    cancelAnimationFrame(raf);
    raf = 0;
    updatePlayButtons();
  } else { lastTime = 0; requestFrame(); }
});
reduceMotion.addEventListener('change', () => {
  playing = false;
  heroPlaying = false;
  updatePlayButtons();
  dirtyMain = true;
  requestFrame();
});

async function init() {
  try {
    scene = await createGalleryScene();
    mainView = new SpiralView(transformed);
    heroView = new SpiralView(heroCanvas);
    mainView.setScene(scene);
    heroView.setScene(scene);
    beta = Math.atan2(scene.geom.ctx.logS, 2 * Math.PI);
    el('beta').textContent = `${(beta * 180 / Math.PI).toFixed(1)}°`;
    el('hero-loading').hidden = true;
    el('stage-loading').hidden = true;
    controls.forEach((_, index) => updateControl(index));
    resize();
  } catch (error) {
    console.error('Could not open the illustrated gallery', error);
    el('hero-loading').textContent = 'The gallery couldn’t load. Refresh to try again.';
    el('stage-loading').textContent = 'The gallery couldn’t load. The explanation is still here.';
    heroPlay.disabled = true;
    stagePlay.disabled = true;
  }
}

void init();
