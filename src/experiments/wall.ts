/**
 * Experiment 08 — "The Print Gallery".
 *
 * The tententoon presented as an exhibited artwork: framed, matted, lit and
 * captioned. All the room dressing lives in wall.html's CSS; this file owns
 * the living print (one SpiralView), the three viewing stances, the mouse
 * parallax, re-hanging a visitor's photo, and the PNG takeaway.
 */
import {
  attachImageInput,
  buildScene,
  downloadCanvasPng,
  loadDemoScene,
  loadImageEl,
  startLoop,
  SpiralView,
  type Scene
} from './kit';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const sceneEl = $('#scene');
const artwork = $('#artwork');
const glass = $('#glass');
const canvas = $<HTMLCanvasElement>('#art');
const veil = $('#veil');
const veilMsg = $('#veilMsg');
const spot = $('#spot');
const pool = $('#pool');
const dim = $('#dim');
const metaEl = $('#meta');
const plaqueTitle = $('#plaqueTitle');
const labelTitle = $('#labelTitle');
const stepBtn = $('#stepBtn');
const hangBtn = $('#hangBtn');
const saveBtn = $('#saveBtn');
const fileInput = $<HTMLInputElement>('#file');

const PLACEHOLDER = 'name your piece';

/* ── The living print ──────────────────────────────────────────────── */

let view: SpiralView | null = null;
try {
  view = new SpiralView(canvas);
} catch {
  veilMsg.textContent =
    'This room needs WebGL2 to light the print, and your browser declined. ' +
    'The frame, at least, is real.';
}

let scene: Scene | null = null;
let needsAutosize = true;

/* ── Stances: room → close → nose-up → room ────────────────────────── */

const STANCES = ['room', 'close', 'nose'] as const;
type Stance = (typeof STANCES)[number];
const ZOOM: Record<Stance, number> = { room: 1, close: 1.6, nose: 2.4 };
const PERIOD: Record<Stance, number> = { room: 10, close: 6, nose: 6 };
const STEP_LABEL: Record<Stance, string> = {
  room: 'step closer →',
  close: 'closer still →',
  nose: '← step back'
};
let stance: Stance = 'room';

function setStance(s: Stance): void {
  stance = s;
  document.body.dataset.stance = s;
  sceneEl.style.setProperty('--zoom', String(ZOOM[s]));
  retarget();
  loop.period = PERIOD[s];
  stepBtn.textContent = STEP_LABEL[s];
}

/** Walking in recentres the print in the viewport; the scale then dives
 *  toward it (transform-origin sits at the artwork's centre). */
function retarget(): void {
  let dx = 0;
  let dy = 0;
  if (stance !== 'room') {
    dx = window.scrollX + window.innerWidth / 2 - artCenter.x;
    dy = window.scrollY + window.innerHeight / 2 - artCenter.y;
  }
  sceneEl.style.setProperty('--dx', `${dx.toFixed(1)}px`);
  sceneEl.style.setProperty('--dy', `${dy.toFixed(1)}px`);
}

const advance = (): void =>
  setStance(STANCES[(STANCES.indexOf(stance) + 1) % STANCES.length]);

artwork.addEventListener('click', advance);
stepBtn.addEventListener('click', advance);
dim.addEventListener('click', () => setStance('room'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stance !== 'room') setStance('room');
});
/* re-fit the canvas backing store once the walk-up settles (sharp close-ups) */
sceneEl.addEventListener('transitionend', (e) => {
  if (e.target === sceneEl && e.propertyName === 'transform') needsAutosize = true;
});

/* ── Layout: size the glass to the crop, aim the lights ────────────── */

function layout(): void {
  if (!scene) return;
  const aspect = scene.crop.w / scene.crop.h;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw < 720;
  const maxH = vh * (mobile ? 0.38 : 0.52);
  const maxW = mobile ? vw - 100 : Math.max(260, Math.min(vw * 0.5, vw - 470));
  let h = maxH;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  glass.style.width = `${Math.round(w)}px`;
  glass.style.height = `${Math.round(h)}px`;
  needsAutosize = true;
  placeLights();
}

/** Transform-independent centre of `el` within `root` (offset chain). */
function centerWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}

let artCenter = { x: 0, y: 0 };

function placeLights(): void {
  artCenter = centerWithin(artwork, sceneEl);
  spot.style.left = `${artCenter.x}px`;
  spot.style.top = `${artCenter.y}px`;
  pool.style.left = `${artCenter.x}px`;
  /* stepping closer zooms toward the artwork, wherever it hangs */
  sceneEl.style.transformOrigin = `${artCenter.x}px ${artCenter.y}px`;
  retarget();
}

window.addEventListener('resize', layout);

/* ── Label metadata from the live geometry ─────────────────────────── */

function updateMeta(): void {
  if (!scene) return;
  const S = scene.geom.S;
  const logS = Math.log(S);
  const turnDeg = ((logS * logS) / (2 * Math.PI)) * (180 / Math.PI);
  metaEl.replaceChildren();
  const half = (text: string) => {
    const span = document.createElement('span');
    span.textContent = text;
    metaEl.append(span);
  };
  half(`shrink ×${S.toFixed(2)} per copy`);
  metaEl.append(' · ');
  half(`turn per copy ${turnDeg.toFixed(1)}°`);
}

/* ── Plaque title (engraved, editable) ─────────────────────────────── */

function syncTitle(): void {
  const text = plaqueTitle.textContent?.trim() ?? '';
  if (!text && plaqueTitle.innerHTML !== '') plaqueTitle.innerHTML = '';
  labelTitle.textContent = text || PLACEHOLDER;
}
plaqueTitle.addEventListener('input', syncTitle);
plaqueTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    plaqueTitle.blur();
  }
});

/* ── Hanging pictures ──────────────────────────────────────────────── */

function adopt(next: Scene): void {
  scene = next;
  view?.setScene(next);
  layout();
  updateMeta();
  /* paint behind the veil so the reveal never flashes */
  if (view && view.autosize()) {
    needsAutosize = false;
    view.render({ t: loop.t });
  }
}

let hanging = false;
function hang(img: HTMLImageElement): void {
  if (!view || hanging) return;
  hanging = true;
  veilMsg.textContent = '';
  veil.classList.add('show');
  window.setTimeout(() => {
    adopt(buildScene(img, undefined, scene ?? undefined));
    plaqueTitle.textContent = '';
    syncTitle();
    veil.classList.remove('show');
    hanging = false;
  }, 500);
}

attachImageInput(document.body, hang);
hangBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f && f.type.startsWith('image/')) {
    const url = URL.createObjectURL(f);
    void loadImageEl(url).then((img) => {
      hang(img);
      URL.revokeObjectURL(url);
    });
  }
  fileInput.value = '';
});

/* ── Take the print home ───────────────────────────────────────────── */

saveBtn.addEventListener('click', () => {
  if (!view || !scene) return;
  view.render({ t: loop.t }); // fresh frame in the drawing buffer for toBlob
  const slug =
    (plaqueTitle.textContent?.trim() ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'untitled';
  downloadCanvasPng(canvas, `${slug}-print-gallery.png`);
});

/* ── Parallax (mouse only — the room feels dimensional) ────────────── */

const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let targX = 0;
let targY = 0;
let curX = 0;
let curY = 0;
if (fine) {
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    targX = (e.clientX / window.innerWidth) * 2 - 1;
    targY = (e.clientY / window.innerHeight) * 2 - 1;
  });
}

/* ── One rAF for the whole room ────────────────────────────────────── */

const loop = startLoop(
  (t) => {
    if (fine) {
      const damp = 1 / ZOOM[stance]; // calmer when standing close
      curX += (targX * damp - curX) * 0.07;
      curY += (targY * damp - curY) * 0.07;
      sceneEl.style.setProperty('--mx', curX.toFixed(4));
      sceneEl.style.setProperty('--my', curY.toFixed(4));
    }
    if (!view || !scene) return;
    if (needsAutosize && view.autosize()) needsAutosize = false;
    view.render({ t });
  },
  { period: PERIOD.room }
);

/* ── Open the doors ────────────────────────────────────────────────── */

if (view) {
  loadDemoScene()
    .then((s) => {
      adopt(s);
      veil.classList.remove('show');
    })
    .catch(() => {
      veilMsg.textContent = 'The demo print went missing from storage.';
    });
}
