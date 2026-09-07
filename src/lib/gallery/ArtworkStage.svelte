<script lang="ts">
  import { onMount } from 'svelte';
  import { GalleryRenderer, loadGalleryScene, type GalleryScene } from './renderer';
  import type { GalleryItem } from './types';

  let { item, progress = 0, playing = false, onready, onerror }: {
    item: GalleryItem; progress?: number; playing?: boolean;
    onready?: (item: GalleryItem) => void;
    onerror?: (item: GalleryItem) => void;
  } = $props();
  let host: HTMLDivElement;
  let viewport: HTMLDivElement;
  let gpuCanvas: HTMLCanvasElement;
  let cpuCanvas: HTMLCanvasElement;
  let mounted = $state(false);
  let ready = $state(false);
  let error = $state('');
  let retry = $state(0);
  let cpu = $state(false);
  let visual = $state(0);
  let sourceAspect = $state(1);
  let workingCrop = $state({ x: 0, y: 0, w: 1, h: 1 });
  const initialCrop = $derived({
    x: sourceAspect > 1 ? (1 - 1 / sourceAspect) / 2 : 0,
    y: sourceAspect < 1 ? (1 - sourceAspect) / 2 : 0,
    w: Math.min(1, 1 / sourceAspect),
    h: Math.min(1, sourceAspect)
  });
  const framing = $derived(smooth(visual * 2));
  const crop = $derived({
    x: initialCrop.x + (workingCrop.x - initialCrop.x) * framing,
    y: initialCrop.y + (workingCrop.y - initialCrop.y) * framing,
    w: initialCrop.w + (workingCrop.w - initialCrop.w) * framing,
    h: initialCrop.h + (workingCrop.h - initialCrop.h) * framing
  });
  const viewportAspect = $derived(crop.w * sourceAspect / crop.h);
  const viewportWidth = $derived(Math.min(1, viewportAspect));
  const viewportHeight = $derived(Math.min(1, 1 / viewportAspect));
  const frameRect = $derived({
    x: (item.nest.x - crop.x) / crop.w,
    y: (item.nest.y - crop.y) / crop.h,
    w: item.nest.w / crop.w,
    h: item.nest.h / crop.h
  });
  const spiralReveal = $derived(smooth(visual - 1));
  // Droste lives inside its aperture. Only the spiral opens the rest of
  // the scene, so the original photograph keeps its unbroken outer edges.
  const apertureMask = $derived(item.shape === 'ellipse' && visual < 2
    ? `radial-gradient(ellipse ${frameRect.w * 50 * (1 - spiralReveal) + 145 * spiralReveal}% ${frameRect.h * 50 * (1 - spiralReveal) + 145 * spiralReveal}% at ${(frameRect.x + frameRect.w / 2) * 100}% ${(frameRect.y + frameRect.h / 2) * 100}%, #000 96%, transparent 100%)`
    : 'none');
  const apertureClip = $derived(item.shape === 'rect' && visual < 2
    ? `inset(${frameRect.y * 100 * (1 - spiralReveal)}% ${(1 - frameRect.x - frameRect.w) * 100 * (1 - spiralReveal)}% ${(1 - frameRect.y - frameRect.h) * 100 * (1 - spiralReveal)}% ${frameRect.x * 100 * (1 - spiralReveal)}%)`
    : 'none');
  let scene: GalleryScene | null = null;
  let renderer: GalleryRenderer;
  let current = 0, phase = 0, lastPaint = 0, dirty = true;
  let visible = true, reduced = false;

  $effect(() => {
    const selected = item;
    void retry;
    if (!mounted) return;
    let cancelled = false;
    scene = null; ready = false; error = ''; current = 0; visual = 0; phase = 0;
    loadGalleryScene(selected).then(loaded => {
      if (cancelled) return;
      scene = loaded; sourceAspect = loaded.image.width / loaded.image.height;
      workingCrop = {
        x: loaded.ctx.cropX / loaded.image.width,
        y: loaded.ctx.cropY / loaded.image.height,
        w: loaded.ctx.W / loaded.image.width,
        h: loaded.ctx.H / loaded.image.height
      };
      ready = true; dirty = true;
      onready?.(selected);
    }).catch(() => {
      if (!cancelled) { error = 'This image could not load. Try again.'; onerror?.(selected); }
    });
    return () => { cancelled = true; };
  });

  onMount(() => {
    renderer = new GalleryRenderer(gpuCanvas, cpuCanvas);
    cpu = renderer.fallback;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motionChange = () => { reduced = media.matches; dirty = true; };
    motionChange(); media.addEventListener('change', motionChange);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; dirty = true; }, { rootMargin: '100px' });
    observer.observe(host);
    const resize = new ResizeObserver(() => { dirty = true; });
    resize.observe(host); resize.observe(viewport);
    const visibilityChange = () => { dirty = true; };
    document.addEventListener('visibilitychange', visibilityChange);
    let raf = 0, previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      if (visible && !document.hidden && scene) {
        const target = Math.max(0, Math.min(2, progress));
        const before = current;
        current = reduced ? target : current + (target - current) * (1 - Math.exp(-dt * 6));
        if (Math.abs(current - target) < .001) current = target;
        const moving = playing && !reduced && current >= .98;
        if (moving) phase = (phase + dt / 14) % 1;
        if (target === 0 && current < .005) phase = 0;
        const changed = before !== current;
        // Preserve changes across the frame throttle, including instantaneous
        // reduced-motion updates that only differ for one animation tick.
        if (changed || moving) dirty = true;
        const interval = cpu ? 100 : 1000 / 45;
        if (dirty && now - lastPaint >= interval) {
          if (current > .001) renderer.render(scene, Math.max(0, current - 1), phase);
          visual = current; lastPaint = now; dirty = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    mounted = true;
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); resize.disconnect(); renderer.dispose();
      media.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', visibilityChange);
    };
  });
  function smooth(v: number) { const n = Math.min(1, Math.max(0, v)); return n * n * (3 - 2 * n); }
</script>

<div class="artwork-stage" bind:this={host} data-ready={ready} data-progress={visual.toFixed(2)} data-renderer={cpu ? 'cpu' : 'webgl'} aria-label={`${item.title}, ${progress < .5 ? 'original image' : progress < 1.5 ? 'Droste repetition' : 'tententoon spiral'}`} role="group">
  <div class="viewport" bind:this={viewport} style:left={`${(1 - viewportWidth) * 50}%`} style:top={`${(1 - viewportHeight) * 50}%`} style:width={`${viewportWidth * 100}%`} style:height={`${viewportHeight * 100}%`}>
  {#key `${item.src}:${retry}`}
    <img class="source" src={item.src} alt={item.alt} decoding="async" style:left={`${-crop.x / crop.w * 100}%`} style:top={`${-crop.y / crop.h * 100}%`} style:width={`${100 / crop.w}%`} style:height={`${100 / crop.h}%`} />
  {/key}
  <div class="transformed" style:opacity={ready ? smooth(visual) : 0} style:mask-image={apertureMask} style:clip-path={apertureClip}>
    <canvas bind:this={gpuCanvas} class:hidden={cpu} aria-hidden="true"></canvas>
    <canvas bind:this={cpuCanvas} class:hidden={!cpu} aria-hidden="true"></canvas>
  </div>
  {#if visual > .03 && visual < .95}
    <div class="frame" style:left={`${frameRect.x * 100}%`} style:top={`${frameRect.y * 100}%`} style:width={`${frameRect.w * 100}%`} style:height={`${frameRect.h * 100}%`} style:border-radius={item.shape === 'ellipse' ? '50%' : '0'} style:opacity={Math.sin(visual * Math.PI)}></div>
  {/if}
  </div>
  {#if error}
    <div class="load-state" role="alert"><span>{error}</span><button onclick={() => retry++}>Retry</button></div>
  {:else if !ready}
    <div class="loading" role="status">Opening image<span></span></div>
  {/if}
</div>

<style>
  .artwork-stage { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; isolation: isolate; background: #22221e; }
  .viewport { position: absolute; overflow: hidden; }
  .source, .transformed, canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .source { max-width: none; max-height: none; }
  .transformed { will-change: clip-path; }
  canvas.hidden { display: none; }
  .frame { position: absolute; border: 1.5px solid #fff4bc; box-shadow: 0 0 0 1px #0003, 0 0 26px #f5f1c52a; pointer-events: none; }
  .loading { position: absolute; bottom: 18px; left: 18px; padding: 9px 13px; background: #161714c9; border-radius: 30px; color: #fff; font: 11px/1.2 system-ui; letter-spacing: .03em; display:flex; gap:10px; align-items:center; }
  .loading span { width: 6px; height:6px; border-radius:50%; background:#d5dfb3; }
  .load-state { position: absolute; inset: 0; display: flex; gap: 16px; align-items: center; justify-content: center; flex-direction: column; background: #191919b0; color: white; font: 14px/1.5 system-ui; }
  .load-state button { color: inherit; background: transparent; border: 1px solid #fff8; padding: 8px 18px; border-radius: 30px; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) { .transformed { will-change: auto; } }
</style>
