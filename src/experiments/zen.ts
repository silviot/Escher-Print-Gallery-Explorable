/**
 * Experiment 01 — zen: "The Loop Is the Hero".
 *
 * The whole viewport is the animating spiral from first paint; every
 * piece of UI is summoned by input and dissolves when you stop asking.
 * All playback state lives here — startLoop is used purely as the one
 * rAF driver, with our own phase integration so the loop can run
 * backwards ("out") at any period without skipping.
 */
import {
  SpiralView,
  attachImageInput,
  buildScene,
  defaultNest,
  downloadCanvasPng,
  loadDemoScene,
  startLoop
} from './kit';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const body = document.body;
const canvas = $('stage') as HTMLCanvasElement;
const veil = $('veil');
const scrubFill = document.querySelector<HTMLElement>('#scrub i')!;
const playBtn = $('play') as HTMLButtonElement;
const dirBtn = $('dir') as HTMLButtonElement;
const lenBtn = $('len') as HTMLButtonElement;
const photoBtn = $('photo') as HTMLButtonElement;
const saveBtn = $('save') as HTMLButtonElement;
const controls = $('controls');

function showFailure(message: string): void {
  const p = document.querySelector<HTMLElement>('#fail p')!;
  p.textContent = message;
  body.classList.add('failed', 'ambient');
}

function main(): void {
  /* ── renderer ─────────────────────────────────────────────────── */
  let view: SpiralView;
  try {
    view = new SpiralView(canvas);
  } catch {
    showFailure(
      'This experiment needs WebGL2, which your browser declined to provide. ' +
        'The spiral lives on in the other prototypes — follow the badge below.'
    );
    return;
  }

  /* ── playback state ───────────────────────────────────────────── */
  let phase = 0; // t ∈ [0,1), larger = deeper in
  let playing = true;
  let direction: 1 | -1 = 1; // 1 = in (dive), -1 = out (rise)
  let period = 6; // seconds per loop, per the brief's opening tempo
  const PERIOD_CYCLE = [4, 8, 16];
  let scrubbing = false;
  let sceneReady = false;

  const wrap = (t: number) => ((t % 1) + 1) % 1;

  let lastNow = performance.now();
  startLoop(
    () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (sceneReady && playing && !scrubbing) {
        phase = wrap(phase + (direction * dt) / period);
      }
      view.render({ t: phase });
    },
    { autoplay: false } // we integrate phase ourselves (for reverse play)
  );

  const refit = () => {
    view.autosize();
  };
  window.addEventListener('resize', refit);

  /* ── scene loading / swapping ─────────────────────────────────── */
  loadDemoScene()
    .then((scene) => {
      view.setScene(scene);
      refit();
      sceneReady = true;
      canvas.classList.add('on');
    })
    .catch(() => {
      showFailure('The demo image failed to load — check the connection and reload.');
    });

  // attachImageInput is wired twice (body for drop/paste, button for the
  // picker); both register a window paste listener, so debounce swaps.
  let lastSwapAt = 0;
  const swapImage = (img: HTMLImageElement) => {
    const now = performance.now();
    if (now - lastSwapAt < 350) return;
    lastSwapAt = now;
    veil.classList.add('dark'); // dip to black (180ms)…
    window.setTimeout(() => {
      view.setScene(buildScene(img, defaultNest(img)));
      refit();
      sceneReady = true;
      canvas.classList.add('on');
      veil.classList.remove('dark'); // …and resolve (260ms)
    }, 210);
  };
  attachImageInput(body, swapImage);
  attachImageInput(photoBtn, swapImage, { click: true });

  /* ── chrome (ambient wordmark+badge / summoned controls) ─────────── */
  const IDLE_MS = 2500;
  const IDLE_TOUCH_MS = 4000;
  let idleTimer = 0;

  const hideChrome = () => body.classList.remove('chrome', 'ambient');
  const wake = (ms = IDLE_MS) => {
    body.classList.add('chrome', 'ambient');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hideChrome, ms);
  };

  // First paint: wordmark (and badge) only, fading after ~4s of stillness.
  body.classList.add('ambient');
  idleTimer = window.setTimeout(hideChrome, 4000);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') wake();
  });
  controls.addEventListener('pointerdown', (e) => {
    wake(e.pointerType === 'touch' ? IDLE_TOUCH_MS : IDLE_MS);
  });

  /* ── scrubbing (horizontal drag on the stage) ─────────────────── */
  const TAP_SLOP = 8; // px before a press becomes a scrub
  let pressId = -1;
  let pressX = 0;
  let pressPhase = 0;
  let pressMoved = false;

  const paintScrub = () => {
    scrubFill.style.width = `${phase * 100}%`;
  };

  canvas.addEventListener('pointerdown', (e) => {
    pressId = e.pointerId;
    pressX = e.clientX;
    pressPhase = phase;
    pressMoved = false;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pressId) return;
    const dx = e.clientX - pressX;
    if (!pressMoved && Math.abs(dx) > TAP_SLOP) {
      pressMoved = true;
      scrubbing = true; // playback freezes; resumes untouched on release
      body.classList.add('scrubbing');
    }
    if (pressMoved) {
      // one viewport width of drag = one full loop
      phase = wrap(pressPhase + dx / Math.max(1, window.innerWidth));
      paintScrub();
    }
  });

  const endPress = (e: PointerEvent) => {
    if (e.pointerId !== pressId) return;
    pressId = -1;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (pressMoved) {
      scrubbing = false;
      body.classList.remove('scrubbing');
    } else if (e.pointerType === 'touch') {
      // tap: summon / dismiss the control layer
      if (body.classList.contains('chrome')) {
        window.clearTimeout(idleTimer);
        hideChrome();
      } else {
        wake(IDLE_TOUCH_MS);
      }
    }
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', endPress);

  /* ── controls ─────────────────────────────────────────────────── */
  const reflectPlay = () => playBtn.classList.toggle('paused', !playing);
  const togglePlay = () => {
    playing = !playing;
    reflectPlay();
  };

  playBtn.addEventListener('click', togglePlay);

  dirBtn.addEventListener('click', () => {
    direction = direction === 1 ? -1 : 1;
    dirBtn.querySelector('span')!.textContent = direction === 1 ? 'in ↓' : 'out ↑';
  });

  lenBtn.addEventListener('click', () => {
    const next = PERIOD_CYCLE.find((p) => p > period) ?? PERIOD_CYCLE[0];
    period = next;
    lenBtn.textContent = `${period}s`;
  });

  saveBtn.addEventListener('click', () => {
    if (!sceneReady) return;
    view.render({ t: phase }); // fresh draw in this task: toBlob sees pixels
    downloadCanvasPng(canvas, 'tententoon-zen.png');
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
      wake();
    }
  });
}

main();
