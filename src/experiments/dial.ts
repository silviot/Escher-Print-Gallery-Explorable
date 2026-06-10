/**
 * Experiment 04 — "One Knob".
 *
 * The whole interface is a single dial controlling twist-per-copy as a
 * fraction of canonical: 0 = straight Droste fall, 1 = the tententoon
 * spiral (kTwist = fraction × logS/2π). Dial range −1.5…+1.5 mapped
 * over 270° of physical rotation (90° of knob per fraction unit).
 * Flick physics: inertia with ~0.94/frame decay and soft magnetic
 * detents at 0 and 1.
 */
import {
  attachImageInput,
  buildScene,
  defaultNest,
  fitContain,
  loadDemoScene,
  startLoop,
  SpiralView,
  type Scene
} from './kit';

const TWO_PI = Math.PI * 2;
const DEG_PER_FRAC = 90; // 270° of knob = 3 fraction units
const F_MAX = 1.5;
const DETENTS = [0, 1];
const DETENT_RANGE = 0.065; // capture distance (fraction)
const DETENT_MAX_SPEED = 0.5; // capture speed (fraction/s)
const DECAY = 0.94; // velocity multiplier per 60 Hz frame

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const stageArea = $('stageArea');
const plate = $('plate');
const plateMsg = $('plateMsg');
const canvas = $('gl') as HTMLCanvasElement;
const dialEl = $('dial');
const knob = $('knob');
const readout = $('readout');
const valueEl = $('value');
const captionEl = $('caption');

/* ── tick ring ─────────────────────────────────────────────────────
   viewBox half-extent 62; knob inset 11% of the wrapper → knob radius
   0.39 × 124 ≈ 48.4 svg units; ticks live just outside it. */
{
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('ticks') as unknown as SVGSVGElement;
  svg.setAttribute('viewBox', '-62 -62 124 124');
  const polar = (frac: number, r: number) => {
    const a = ((frac * DEG_PER_FRAC - 90) * Math.PI) / 180; // 0 at top
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };
  for (let i = -15; i <= 15; i++) {
    const frac = i / 10;
    const detent = i === 0 || i === 10;
    const major = i % 5 === 0;
    const r1 = detent ? 49.5 : major ? 50 : 51;
    const r2 = detent ? 55.5 : major ? 54.6 : 54;
    const p1 = polar(frac, r1);
    const p2 = polar(frac, r2);
    const cls = detent ? 'tick detent' : major ? 'tick major' : 'tick';
    const width = detent ? 1.7 : major ? 1.3 : 0.7;
    // paper-coloured halo first so ticks stay legible over the photo
    for (const halo of [true, false]) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', p1.x.toFixed(2));
      line.setAttribute('y1', p1.y.toFixed(2));
      line.setAttribute('x2', p2.x.toFixed(2));
      line.setAttribute('y2', p2.y.toFixed(2));
      line.setAttribute('class', cls);
      if (halo) {
        line.setAttribute('style', `stroke:rgba(244,241,234,.85);stroke-width:${width + 1.8}`);
      }
      svg.appendChild(line);
    }
  }
  for (const [frac, text] of [[0, '0'], [1, '1']] as const) {
    const p = polar(frac, 59.5);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', p.x.toFixed(2));
    t.setAttribute('y', p.y.toFixed(2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('class', 'tick-label');
    t.textContent = text;
    svg.appendChild(t);
  }
}

/* ── GL view ─────────────────────────────────────────────────────── */

let scene: Scene | null = null;
let view: SpiralView | null = null;
try {
  view = new SpiralView(canvas);
} catch {
  plateMsg.textContent = 'this poster needs webgl2 — your browser declined';
}

function layout(): void {
  const r = stageArea.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const w = scene ? scene.crop.w : 1283;
  const h = scene ? scene.crop.h : 1000;
  const fit = fitContain(w, h, r.width, r.height);
  plate.style.width = `${Math.round(fit.w)}px`;
  plate.style.height = `${Math.round(fit.h)}px`;
  view?.autosize();
}
new ResizeObserver(layout).observe(stageArea);
window.addEventListener('resize', layout);

function adopt(next: Scene): void {
  scene = next;
  view?.setScene(next);
  layout();
  if (view) plate.classList.add('ready');
}

loadDemoScene()
  .then((s) => adopt(s))
  .catch(() => {
    plateMsg.textContent = 'demo photo failed to load — drop one anywhere';
  });

attachImageInput(document.body, (img) => {
  adopt(buildScene(img, defaultNest(img), scene ?? undefined));
});

/* ── dial state + physics ────────────────────────────────────────── */

let f = 1; // open on the canonical tententoon
let vel = 0; // fraction units / s
let dragging = false;
let lastPointerAngle = 0;
let samples: { t: number; f: number }[] = [];
let settledOn: number | null = 1; // suppress the snap pulse on load

const clampF = (x: number): number => Math.max(-F_MAX, Math.min(F_MAX, x));

const pointerAngle = (e: PointerEvent): number => {
  const r = dialEl.getBoundingClientRect();
  return (
    (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
    Math.PI
  );
};

dialEl.addEventListener('pointerdown', (e) => {
  dragging = true;
  vel = 0;
  settledOn = null;
  lastPointerAngle = pointerAngle(e);
  samples = [{ t: performance.now(), f }];
  dialEl.setPointerCapture(e.pointerId);
  dialEl.classList.add('grabbing');
  e.preventDefault();
});

dialEl.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  // walk every coalesced event so flick velocity survives event batching
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const ev of events.length ? events : [e]) {
    const a = pointerAngle(ev);
    // shortest signed difference — no jump across ±180°
    const delta = ((a - lastPointerAngle + 540) % 360) - 180;
    lastPointerAngle = a;
    f = clampF(f + delta / DEG_PER_FRAC);
    samples.push({ t: ev.timeStamp || performance.now(), f });
  }
  while (samples.length > 48 || (samples.length > 2 && samples[samples.length - 1].t - samples[0].t > 300)) {
    samples.shift();
  }
});

const endDrag = () => {
  if (!dragging) return;
  dragging = false;
  dialEl.classList.remove('grabbing');
  // release velocity from the recent movement; 0 when the pointer was
  // held still (no move samples in the last ~180 ms)
  const now = performance.now();
  const last = samples[samples.length - 1];
  // prefer a tight window (sharp flicks); widen when events were sparse
  const oldest = samples.find((s) => now - s.t <= 130) ?? samples.find((s) => now - s.t <= 240);
  if (last && oldest && now - last.t < 180 && now - oldest.t > 25) {
    vel = Math.max(-8, Math.min(8, ((f - oldest.f) * 1000) / (now - oldest.t)));
  } else {
    vel = 0;
  }
};
dialEl.addEventListener('pointerup', endDrag);
dialEl.addEventListener('pointercancel', endDrag);
dialEl.addEventListener('lostpointercapture', endDrag);

function pulse(): void {
  readout.classList.remove('snap');
  void readout.offsetWidth; // restart the animation
  readout.classList.add('snap');
}

let lastNow = performance.now();
function step(): void {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  if (dragging || dt === 0) return;

  if (vel !== 0) {
    f += vel * dt;
    vel *= Math.pow(DECAY, dt * 60);
    if (Math.abs(vel) < 0.003) vel = 0;
  }
  // end stops: a dead little bounce, like hitting a mechanical limit
  if (f > F_MAX) {
    f = F_MAX;
    if (vel > 0) vel = -vel * 0.22;
  } else if (f < -F_MAX) {
    f = -F_MAX;
    if (vel < 0) vel = -vel * 0.22;
  }
  // soft magnetic detents at 0 and 1
  for (const d of DETENTS) {
    if (Math.abs(f - d) < DETENT_RANGE && Math.abs(vel) < DETENT_MAX_SPEED) {
      f += (d - f) * (1 - Math.exp(-dt * 10));
      vel *= Math.exp(-dt * 14);
      if (Math.abs(f - d) < 0.0008 && Math.abs(vel) < 0.02) {
        f = d;
        vel = 0;
        if (settledOn !== d) {
          settledOn = d;
          pulse();
        }
      }
      return;
    }
  }
  settledOn = null;
}

/* ── readout + knob paint ────────────────────────────────────────── */

let lastValueText = '';
let lastCaptionText = '';
let lastRotation = NaN;

function paint(): void {
  if (f !== lastRotation) {
    knob.style.transform = `rotate(${f * DEG_PER_FRAC}deg)`;
    lastRotation = f;
  }
  const logS = scene ? scene.geom.ctx.logS : 0.77;
  const deg = ((((f * logS * logS) / TWO_PI) * 180) / Math.PI);
  const r = Math.round(deg * 10) / 10;
  const text = `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}°`;
  if (text !== lastValueText) {
    valueEl.textContent = text;
    lastValueText = text;
  }
  let caption = 'turn per copy';
  let tenten = false;
  if (Math.abs(f) < 0.015) caption = 'a droste';
  else if (Math.abs(f - 1) <= 0.03) {
    caption = 'the tententoon';
    tenten = true;
  }
  if (caption !== lastCaptionText) {
    captionEl.textContent = caption;
    lastCaptionText = caption;
  }
  readout.classList.toggle('tenten', tenten);
}

/* ── keyboard (precision nudge) ──────────────────────────────────── */

/** Nudge by ±step; stepping off a detent "clicks out" past its magnet. */
function nudge(dir: 1 | -1, step: number): void {
  let target = f + dir * step;
  for (const d of DETENTS) {
    if (f === d && Math.abs(target - d) < DETENT_RANGE + 0.005) {
      target = d + dir * (DETENT_RANGE + 0.005);
    }
  }
  f = clampF(target);
  vel = 0;
  settledOn = null;
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = e.shiftKey ? 0.1 : 0.01;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    nudge(1, step);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    nudge(-1, step);
    e.preventDefault();
  } else if (e.key === '0' || e.key === '1') {
    f = Number(e.key);
    vel = 0;
    if (settledOn !== f) {
      settledOn = f;
      pulse();
    }
  }
});

/* ── the one rAF driver ──────────────────────────────────────────── */

startLoop(
  (t) => {
    step();
    if (view && scene) {
      const kTwist = (f * scene.geom.ctx.logS) / TWO_PI;
      view.render({ t, kTwist });
    }
    paint();
  },
  { period: 7 }
);
