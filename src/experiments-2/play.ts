import './play.css';
import { createGalleryScene, SpiralView } from './view';
import { drawDrosteZoom, loadDemoScene, type Scene } from '../experiments/kit';

type Step = 'repeat' | 'unroll' | 'tilt' | 'return';
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picture = get<HTMLDivElement>('picture');
const spiral = get<HTMLCanvasElement>('spiral');
const repeat = get<HTMLCanvasElement>('repeat');
const amount = get<HTMLInputElement>('amount');
const motion = get<HTMLButtonElement>('motion');
const source = get<HTMLButtonElement>('source');
const originalButton = get<HTMLButtonElement>('original-toggle');
const original = get<HTMLImageElement>('original');
const loadState = get<HTMLDivElement>('load-state');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const stepButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-step]'));
const notes: Record<Step, { number: string; label: string; title: string; copy: string; figure: string; slider: string; start: string; end: string; hint: string }> = {
  repeat: {
    number: '01', label: 'Repeat', title: 'A picture.\nInside a picture.',
    copy: 'The frame holds a smaller copy of the whole scene. That copy holds another. And another. Zoom into the frame: you arrive at the same picture, one level deeper.',
    figure: 'The same picture, one level deeper', slider: 'Zoom into the next copy', start: 'This picture', end: 'The next picture',
    hint: 'Move from one end to the other. You finish exactly where you started.'
  },
  unroll: {
    number: '02', label: 'Unroll', title: 'Make forever\nlie flat.',
    copy: 'Unwrap the picture around its centre. Distance from the centre becomes position along a strip. Tiny copies and huge copies now take up the same amount of room.',
    figure: 'Nested pictures become a repeating strip', slider: 'Unroll the picture', start: 'Nested picture', end: 'Flat strip',
    hint: 'Drag to the right. This is a visual bridge into logarithmic coordinates.'
  },
  tilt: {
    number: '03', label: 'Tilt', title: 'A very small\nchange of angle.',
    copy: 'Lean the strip until one trip around the picture also moves one repetition along it. That connects a big copy to the next smaller one. The exact angle comes from their size ratio.',
    figure: 'A little lean connects one copy to the next', slider: 'Tilt the repeating strip', start: 'No tilt', end: 'One-copy alignment',
    hint: 'The endpoint is the precise angle for this picture. Next, choose Return.'
  },
  return: {
    number: '04', label: 'Return', title: 'And round\nwe go.',
    copy: 'Roll the tilted strip back into a picture. Now a trip around the centre lands one copy deeper. A stack of pictures becomes one continuous spiral.',
    figure: 'A picture with no last picture', slider: 'Roll the picture back up', start: 'Flat strip', end: 'Endless spiral',
    hint: 'Drag the handle backwards to see where the spiral came from.'
  }
};

let step: Step = 'return';
let progress = 1;
let phase = 0.13;
let playing = !reducedMotion.matches;
let visible = true;
let disposed = false;
let raf = 0;
let lastFrame = 0;
let scene: Scene | null = null;
let galleryScene: Scene | null = null;
let photoScene: Scene | null = null;
let photograph = true;
let showingOriginal = false;
let view: SpiralView;

function setMotionUi(): void {
  motion.setAttribute('aria-pressed', String(playing));
  motion.querySelector('.motion-icon')!.textContent = playing ? 'Ⅱ' : '▷';
  motion.querySelector('.motion-label')!.textContent = playing ? 'Pause the journey' : 'Let it run';
}

function angle(): number { return scene ? Math.atan2(scene.geom.ctx.logS, 2 * Math.PI) : 0; }

function updateAmount(): void {
  const value = step === 'tilt' ? `${(angle() * progress * 180 / Math.PI).toFixed(1)}°` : `${Math.round(progress * 100)}%`;
  get<HTMLOutputElement>('amount-value').textContent = value;
  amount.setAttribute('aria-valuetext', step === 'tilt' ? `${(angle() * progress * 180 / Math.PI).toFixed(1)} degrees` : `${Math.round(progress * 100)} percent`);
  get('slider-hint').textContent = (step === 'unroll' || step === 'return') && progress > 0 && progress < 1
    ? 'The open edge is the cut that lets us unwrap the picture. The finished spiral closes it.'
    : notes[step].hint;
}

function updateStep(): void {
  const note = notes[step];
  get('note-number').textContent = note.number;
  get('note-label').textContent = note.label;
  get('note-title').textContent = note.title;
  get('note-copy').textContent = photograph && step === 'repeat'
    ? 'An observatory lives inside a pear. Put a smaller copy of its whole world inside the round doorway, then repeat. Zoom in: the same telescope and stairways appear again, one level deeper.'
    : note.copy;
  get('figure-label').textContent = note.figure;
  document.querySelector('.figure-index')!.textContent = `FIG. ${note.number}`;
  get('amount-label').textContent = note.slider;
  get('range-start').textContent = note.start;
  get('range-end').textContent = note.end;
  get('slider-hint').textContent = note.hint;
  for (const button of stepButtons) button.setAttribute('aria-pressed', String(button.dataset.step === step));
  spiral.hidden = showingOriginal || step === 'repeat';
  repeat.hidden = showingOriginal || step !== 'repeat';
  original.hidden = !showingOriginal;
  originalButton.textContent = showingOriginal ? 'Back to the effect' : 'See the original';
  originalButton.setAttribute('aria-pressed', String(showingOriginal));
  spiral.setAttribute('aria-label', `${photograph ? 'A pear observatory' : 'An illustrated gallery'} ${step === 'unroll' ? 'unwrapping into a repeating strip' : step === 'tilt' ? 'repeating along a tilted strip' : 'repeating in a continuous spiral'}`);
  repeat.setAttribute('aria-label', `${photograph ? 'A pear observatory' : 'An illustrated gallery'} repeated inside smaller copies of itself`);
  updateAmount();
}

function draw(): void {
  if (!scene || !view || disposed) return;
  if (step === 'repeat') {
    drawDrosteZoom(repeat, scene, phase, { background: '#e7e3d7' });
  } else if (step === 'unroll') {
    view.render({ mode: 'unroll', t: phase, twist: 0, rot: 0, morph: 1 - progress });
  } else if (step === 'tilt') {
    view.render({ mode: 'rotlog', t: phase, rot: angle() * progress });
  } else {
    view.render({ mode: 'unroll', t: phase, morph: progress });
  }
}

function schedule(): void {
  if (raf || !playing || !visible || document.hidden || !scene || disposed) return;
  lastFrame = performance.now();
  raf = requestAnimationFrame(tick);
}

function tick(now: number): void {
  raf = 0;
  if (!playing || !visible || document.hidden || disposed) return;
  phase = (phase + Math.min(80, now - lastFrame) / 18000) % 1;
  lastFrame = now;
  if (step === 'repeat') {
    progress = phase;
    amount.value = String(Math.round(progress * 1000));
    updateAmount();
  }
  draw();
  raf = requestAnimationFrame(tick);
}

function pause(): void {
  playing = false;
  cancelAnimationFrame(raf);
  raf = 0;
  setMotionUi();
}

function resize(): void {
  if (!view || !scene) return;
  const bounds = picture.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const aspect = scene.crop.w / scene.crop.h;
  const width = Math.min(bounds.width, bounds.height * aspect);
  const height = width / aspect;
  repeat.style.width = `${width}px`;
  repeat.style.height = `${height}px`;
  repeat.style.left = `${(bounds.width - width) / 2}px`;
  repeat.style.top = `${(bounds.height - height) / 2}px`;
  repeat.width = Math.max(1, Math.round(width * dpr));
  repeat.height = Math.max(1, Math.round(height * dpr));
  // The spiral canvas can be hidden when Repeat is active; size it before
  // hiding so that the next step never starts with a zero-size renderer.
  const hidden = spiral.hidden;
  spiral.hidden = false;
  view.autosize(1.5);
  spiral.hidden = hidden;
  draw();
}

function setScene(next: Scene): void {
  scene = next;
  view.setScene(next);
  if (next.img instanceof HTMLImageElement) original.src = next.img.src;
  original.alt = photograph ? 'A mossy observatory, copper telescope and impossible stairways inside a yellow pear. AI-generated image.' : 'The original illustrated gallery before repetition.';
  source.setAttribute('aria-pressed', String(photograph));
  source.innerHTML = photograph ? 'Try the gallery <span aria-hidden="true">↗</span>' : 'Back to the pear <span aria-hidden="true">↗</span>';
  get('source-credit').textContent = photograph
    ? 'The pear observatory: an AI-generated world. The repetitions are made here.'
    : 'An imaginary gallery. One picture. Infinitely many visits.';
  get('angle-explanation').textContent = `${(angle() * 180 / Math.PI).toFixed(1)}°`;
  picture.setAttribute('aria-busy', 'false');
  loadState.hidden = true;
  updateStep();
  resize();
  schedule();
}

for (const button of stepButtons) {
  button.addEventListener('click', () => {
    pause();
    showingOriginal = false;
    step = button.dataset.step as Step;
    progress = step === 'repeat' ? 0 : 1;
    phase = 0;
    amount.value = String(progress * 1000);
    updateStep();
    resize();
  });
}

amount.addEventListener('input', () => {
  pause();
  if (showingOriginal) { showingOriginal = false; updateStep(); }
  progress = Number(amount.value) / 1000;
  if (step === 'repeat') phase = progress;
  updateAmount();
  draw();
});

motion.addEventListener('click', () => {
  if (showingOriginal) { showingOriginal = false; updateStep(); resize(); }
  if (playing) pause();
  else { playing = true; setMotionUi(); schedule(); }
});

source.addEventListener('click', async () => {
  source.disabled = true;
  try {
    const nextPhoto = !photograph;
    const next = nextPhoto ? (photoScene ??= await loadDemoScene()) : (galleryScene ??= await createGalleryScene());
    if (!next) return;
    photograph = nextPhoto;
    setScene(next);
  } catch {
    get('source-credit').textContent = 'That picture could not load. You can keep exploring the current picture.';
  } finally { source.disabled = false; }
});

originalButton.addEventListener('click', () => {
  pause();
  showingOriginal = !showingOriginal;
  updateStep();
  resize();
});

const observer = new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (!visible) { cancelAnimationFrame(raf); raf = 0; }
  else schedule();
}, { rootMargin: '40px' });
observer.observe(picture);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else schedule();
});
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) pause(); });
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(picture);
// Keep the changing explanation next to the interaction on small screens.
// There is one live region; moving it preserves both its text and semantics.
const mobileLayout = window.matchMedia('(max-width: 700px)');
const stepNote = document.querySelector<HTMLElement>('.step-note')!;
function placeNote(): void {
  if (mobileLayout.matches) document.querySelector('.slider-footer')!.after(stepNote);
  else document.querySelector('.opening')!.append(stepNote);
}
mobileLayout.addEventListener('change', placeNote);
placeNote();
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(raf);
  raf = 0;
});
window.addEventListener('pageshow', schedule);

setMotionUi();
updateStep();
try {
  view = new SpiralView(spiral);
  void loadDemoScene().then((next) => { photoScene = next; setScene(next); }).catch(() => {
    loadState.textContent = 'The picture could not load. Please reload to try again.';
    picture.setAttribute('aria-busy', 'false');
  });
} catch {
  loadState.textContent = 'The picture could not start in this browser. Try the essay for another way in.';
  picture.setAttribute('aria-busy', 'false');
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  observer.disconnect();
  resizeObserver.disconnect();
  mobileLayout.removeEventListener('change', placeNote);
  view?.dispose();
});
