<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';

  /**
   * Continuous Droste zoom.
   *
   * At time t, we draw the source image at multiple nested levels k = 0, 1, 2, …
   * Each level k is drawn at scale σ_fit · S^t / S^k, with the limit point c
   * pinned to the same canvas anchor. Level 0 is the outermost (fit-to-canvas
   * at t = 0); each subsequent level lands exactly in the inner rectangle of
   * the previous one, so we synthesise an infinitely nested Droste image even
   * when the source only has one physical level of self-similarity.
   *
   * As t grows from 0 to 1, every level is multiplied by S — level k at t = 1
   * matches level (k-1) at t = 0 — so the loop closes seamlessly.
   */

  let canvas: HTMLCanvasElement | null = $state(null);
  let t = $state(0);
  let playing = $state(true);
  let cycleSeconds = $state(8);

  const geom = $derived.by(() => {
    const src = imageState.source;
    const r = selectionState.rect;
    if (!src || !r) return null;
    return drosteGeometry({ width: src.width, height: src.height }, r);
  });

  $effect(() => {
    if (!canvas) return;
    const resize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      t = (t + dt / cycleSeconds) % 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    const src = imageState.source;
    const g = geom;
    if (!canvas || !src || !g) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    void t;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a1016';
    ctx.fillRect(0, 0, W, H);

    // Fit the source image to the canvas (letterbox).
    const srcAspect = src.width / src.height;
    const canvasAspect = W / H;
    let fitW: number, fitH: number, offX: number, offY: number;
    if (canvasAspect > srcAspect) {
      fitH = H;
      fitW = H * srcAspect;
    } else {
      fitW = W;
      fitH = W / srcAspect;
    }
    offX = (W - fitW) / 2;
    offY = (H - fitH) / 2;
    const sigmaFit = fitW / src.width; // canvas-px per image-px when rendered fit-to-canvas

    // Anchor: where c appears on canvas at t = 0 (i.e. in the fitted source).
    const anchorX = offX + g.limit.x * sigmaFit;
    const anchorY = offY + g.limit.y * sigmaFit;

    // Clip to the letterbox region so levels don't spill onto the background.
    ctx.save();
    ctx.beginPath();
    ctx.rect(offX, offY, fitW, fitH);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const zoom = Math.pow(g.S, t);

    // Draw outermost first so nested levels paint on top of the inner rectangle.
    // Stop when the rendered image shrinks below ~1.5 canvas pixels — invisible.
    for (let k = 0; k < 32; k++) {
      const scale = (sigmaFit * zoom) / Math.pow(g.S, k);
      const w = src.width * scale;
      if (w < 1.5) break;
      const h = src.height * scale;
      const dx = anchorX - g.limit.x * scale;
      const dy = anchorY - g.limit.y * scale;
      try {
        ctx.drawImage(src.bitmap, dx, dy, w, h);
      } catch {
        // non-fatal
      }
    }

    ctx.restore();
  });

  function togglePlay() { playing = !playing; }
  function reset() { t = 0; }
</script>

<section class="zoom-preview">
  <header>
    <h2>Continuous zoom</h2>
    <div class="controls mono">
      <button onclick={togglePlay} aria-pressed={playing}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button onclick={reset}>Reset</button>
      <label class="speed">
        Cycle
        <input type="range" min="1" max="20" step="0.5" bind:value={cycleSeconds} />
        <span>{cycleSeconds.toFixed(1)} s</span>
      </label>
      <label class="scrub">
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          bind:value={t}
          onpointerdown={() => (playing = false)}
        />
        <span>t = {t.toFixed(3)}</span>
      </label>
    </div>
  </header>

  {#if imageState.source}
    <canvas
      bind:this={canvas}
      class="view"
      style="aspect-ratio: {imageState.source.width} / {imageState.source.height};"
    ></canvas>
    <p class="muted hint">
      Source drawn at scale σ · S<sup>t</sup> / S<sup>k</sup> for every level k, all
      anchored at the limit point c. Level k + 1 always lands in level k's inner rectangle;
      t = 1 is identical to t = 0 so the loop is seamless.
    </p>
  {:else}
    <p class="muted">Place a rectangle above to start.</p>
  {/if}
</section>

<style>
  .zoom-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 960px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    flex-wrap: wrap;
  }
  .speed,
  .scrub {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .scrub input { width: 180px; }
  .speed input { width: 110px; }
  .view {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
  }
  .hint { font-size: 0.85rem; }
</style>
