import { loadDemoScene, drawDrosteZoom } from '../experiments/kit';
import { SpiralView, createGalleryScene } from './view';

async function boot() {
  const [photo, gallery] = await Promise.all([loadDemoScene(), createGalleryScene()]);
  const plain = document.querySelector<HTMLCanvasElement>('#essay-preview')!;
  const spiral = new SpiralView(document.querySelector<HTMLCanvasElement>('#inside-preview')!);
  const strip = new SpiralView(document.querySelector<HTMLCanvasElement>('#play-preview')!);
  spiral.setScene(gallery); strip.setScene(gallery);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = '', phase = .2, raf = 0, last = 0;
  function paint() {
    const bounds = plain.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (plain.width !== Math.round(bounds.width * dpr)) {
      plain.width = Math.round(bounds.width * dpr); plain.height = Math.round(bounds.height * dpr);
    }
    drawDrosteZoom(plain, photo, active === 'essay' ? phase : .1);
    spiral.autosize(); spiral.render({ t: active === 'inside' ? phase : .25 });
    strip.autosize(); strip.render({ mode: 'rotlog', t: active === 'play' ? phase : .3 });
  }
  function tick(now: number) {
    if (document.hidden || reduced.matches || !active) { raf = 0; return; }
    phase = (phase + Math.min(now - last, 70) / 15000) % 1;
    last = now; paint(); raf = requestAnimationFrame(tick);
  }
  function start(name: string) { active = name; if (!raf && !reduced.matches) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function stop() { active = ''; cancelAnimationFrame(raf); raf = 0; paint(); }
  document.querySelectorAll<HTMLElement>('[data-preview]').forEach(link => {
    link.addEventListener('pointerenter', () => start(link.dataset.preview!));
    link.addEventListener('focus', () => start(link.dataset.preview!));
    link.addEventListener('pointerleave', stop); link.addEventListener('blur', stop);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  const observer = new ResizeObserver(paint); observer.observe(plain);
  paint();
  window.addEventListener('pagehide', () => { stop(); observer.disconnect(); spiral.dispose(); strip.dispose(); }, { once: true });
}
void boot().catch(() => {
  document.querySelectorAll('.caption').forEach(caption => { (caption as HTMLElement).style.position = 'static'; });
});
