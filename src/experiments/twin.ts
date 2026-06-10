/**
 * EXPERIMENT 07 — "Twin Infinities"
 *
 * A comparative diptych: the same recursion rendered twice, in lockstep.
 * Left pane is the plain Droste fold (kTwist = 0 — every copy drops
 * straight in); right pane is the canonical tententoon spiral, scaled by
 * a morph slider m ∈ [0,1]. One shared rAF loop drives both panes with
 * the same t, so the only visible difference IS the twist.
 */
import {
  buildScene,
  downloadCanvasPng,
  fitContain,
  loadDemoScene,
  startLoop,
  attachImageInput,
  SpiralView,
  type Scene
} from './kit';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const diptych = $('diptych');
const morphEl = $<HTMLInputElement>('morph');
const scrubEl = $<HTMLInputElement>('scrub');
const playEl = $<HTMLButtonElement>('play');
const degEl = $('deg');
const captionRight = $('caption-right');
const wordStraight = $('word-straight');
const wordTwisted = $('word-twisted');

type Pane = {
  el: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  save: HTMLButtonElement;
  /** Label above + caption below the stage (measured when pinning). */
  label: HTMLElement;
  caption: HTMLElement;
  view: SpiralView | null;
  focusClass: 'focus-left' | 'focus-right';
};

function makePane(side: 'left' | 'right'): Pane {
  const el = $(`pane-${side}`);
  return {
    el,
    stage: $(`stage-${side}`),
    canvas: $<HTMLCanvasElement>(`canvas-${side}`),
    save: $<HTMLButtonElement>(`save-${side}`),
    label: el.querySelector('.pane-label') as HTMLElement,
    caption: $(`caption-${side}`),
    view: null,
    focusClass: side === 'left' ? 'focus-left' : 'focus-right'
  };
}

const panes: [Pane, Pane] = [makePane('left'), makePane('right')];

/* ── GL setup (graceful failure) ───────────────────────────────────── */

try {
  for (const p of panes) p.view = new SpiralView(p.canvas);
} catch {
  document.body.classList.add('gl-failed');
}

/* ── state ─────────────────────────────────────────────────────────── */

let scene: Scene | null = null;
/** Morph amount m ∈ [0,1]: right pane kTwist = m × canonical. */
let m = 1;
let layoutDirty = true;
let scrubbing = false;
let wasPlayingBeforeScrub = false;

/* ── layout: letterbox each canvas to the crop aspect ──────────────── */

const stackedMq = window.matchMedia('(max-width: 720px), (orientation: portrait)');

function refit(): void {
  layoutDirty = false;
  if (!scene) return;
  for (const p of panes) {
    // On the stacked layout, pin the focused stage to the photo so the
    // caption hangs right under the print (CSS centres the group).
    const pin = stackedMq.matches && p.el.classList.contains('focused');
    if (!pin) p.stage.style.flex = '';
    const box = p.stage.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    let w = box.width;
    let h = box.height;
    if (pin) {
      const chromeH = p.label.offsetHeight + p.caption.offsetHeight;
      const avail = Math.max(48, p.el.getBoundingClientRect().height - chromeH);
      const f = fitContain(scene.crop.w, scene.crop.h, box.width, avail);
      w = f.w;
      h = f.h;
      p.stage.style.flex = `0 0 ${h}px`;
    } else if (!p.el.classList.contains('sliver')) {
      // Letterbox to the crop aspect (fitContain inside the half).
      const f = fitContain(scene.crop.w, scene.crop.h, box.width, box.height);
      w = f.w;
      h = f.h;
    } // sliver: fill the strip — SpiralView covers, showing a tall slice.
    p.canvas.style.width = `${w}px`;
    p.canvas.style.height = `${h}px`;
    // Pin the save chip to the photo's top-right corner, not the stage's.
    p.save.style.top = pin ? '10px' : `${(box.height - h) / 2 + 10}px`;
    p.save.style.right = `${(box.width - w) / 2 + 10}px`;
    p.view?.autosize();
  }
}

const markDirty = (): void => {
  layoutDirty = true;
};
const ro = new ResizeObserver(markDirty);
for (const p of panes) {
  ro.observe(p.stage);
  ro.observe(p.el); // pane growth must re-pin the focused stage
}
window.addEventListener('resize', markDirty);
stackedMq.addEventListener('change', markDirty);

/* ── captions: live degrees-per-step from the scene ────────────────── */

function canonicalDegPerStep(s: Scene): number {
  // Each copy sits one period (Δu = logS) deeper; canonical k = logS/2π,
  // so the turn per step is k·logS = logS²/2π radians.
  const logS = s.geom.ctx.logS;
  return ((logS * logS) / (2 * Math.PI)) * (180 / Math.PI);
}

function updateCaptions(): void {
  const identical = m < 0.002;
  captionRight.classList.toggle('identical', identical);
  wordTwisted.classList.toggle('lit', !identical);
  wordStraight.classList.toggle('lit', identical);
  if (scene) degEl.textContent = `${(m * canonicalDegPerStep(scene)).toFixed(1)}°`;
}

/* ── morph slider ──────────────────────────────────────────────────── */

function applyMorph(): void {
  m = Number(morphEl.value) / 1000;
  morphEl.style.setProperty('--fill', `${m * 100}%`);
  updateCaptions();
}
morphEl.addEventListener('input', applyMorph);
applyMorph();

/* ── shared transport: one loop drives BOTH panes ──────────────────── */

const loop = startLoop(
  (t) => {
    if (layoutDirty) refit();
    if (!scrubbing) {
      scrubEl.value = String(Math.round(t * 1000));
      scrubEl.style.setProperty('--fill', `${t * 100}%`);
    }
    if (!scene) return;
    panes[0].view?.render({ t, twist: 0 }); // Droste: falls straight
    panes[1].view?.render({ t, twist: m }); // tententoon: turns as it falls
  },
  { period: 7 }
);

function setPlaying(playing: boolean): void {
  loop.playing = playing;
  playEl.classList.toggle('playing', playing);
  playEl.setAttribute('aria-label', playing ? 'pause' : 'play');
}
playEl.addEventListener('click', () => setPlaying(!loop.playing));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    diptych.classList.remove('focus-left', 'focus-right');
    syncFocusClasses();
    return;
  }
  if (e.code !== 'Space') return;
  const tag = (e.target as HTMLElement | null)?.tagName ?? '';
  if (tag === 'INPUT' || tag === 'BUTTON') return;
  e.preventDefault();
  setPlaying(!loop.playing);
});

scrubEl.addEventListener('pointerdown', () => {
  scrubbing = true;
  wasPlayingBeforeScrub = loop.playing;
  loop.pause();
});
scrubEl.addEventListener('input', () => {
  loop.t = Number(scrubEl.value) / 1000;
  scrubEl.style.setProperty('--fill', `${loop.t * 100}%`);
});
const endScrub = (): void => {
  if (!scrubbing) return;
  scrubbing = false;
  if (wasPlayingBeforeScrub) loop.play();
};
window.addEventListener('pointerup', endScrub);
window.addEventListener('pointercancel', endScrub);

/* ── focus: tap a stage to expand it to ~78% ───────────────────────── */

function syncFocusClasses(): void {
  const anyFocused =
    diptych.classList.contains('focus-left') || diptych.classList.contains('focus-right');
  for (const p of panes) {
    const focused = diptych.classList.contains(p.focusClass);
    p.el.classList.toggle('focused', focused);
    p.el.classList.toggle('sliver', anyFocused && !focused);
  }
  // On mobile the header cedes its height to the focused pane (~78vh).
  document.body.classList.toggle('focus-mode', anyFocused);
  markDirty();
}

for (const p of panes) {
  p.el.addEventListener('click', () => {
    if (diptych.classList.contains(p.focusClass)) {
      diptych.classList.remove(p.focusClass); // tap again to restore
    } else {
      diptych.classList.remove('focus-left', 'focus-right');
      diptych.classList.add(p.focusClass); // focus this side (sliver stays clickable)
    }
    syncFocusClasses();
  });

  p.save.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!p.view || !scene) return;
    // Render synchronously so toBlob sees a fresh drawing buffer.
    const twist = p === panes[0] ? 0 : m;
    p.view.render({ t: loop.t, twist });
    const name = p === panes[0] ? 'twin-droste.png' : 'twin-tententoon.png';
    downloadCanvasPng(p.canvas, name);
  });
}

/* ── photo input: drop / paste swaps BOTH panes (one shared scene) ── */

function setScene(next: Scene): void {
  scene = next;
  for (const p of panes) p.view?.setScene(next);
  updateCaptions();
  markDirty(); // crop aspect may have changed — re-letterbox
  document.body.classList.add('ready');
}

attachImageInput(document.body, (img) => {
  setScene(buildScene(img, undefined, scene ?? undefined));
});

/* ── boot ──────────────────────────────────────────────────────────── */

loadDemoScene()
  .then(setScene)
  .catch(() => {
    /* demo image missing — page stays in its loading state */
  });
