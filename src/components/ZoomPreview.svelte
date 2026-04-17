<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';

  /**
   * Continuous Droste zoom: sample the source at a window centred so that the
   * limit point c stays fixed on screen, and shrink that window by a factor
   * S^t over one cycle (t ∈ [0, 1)). Because the image is self-similar with
   * factor S, t wraps back to 0 seamlessly.
   */

  let canvas: HTMLCanvasElement | null = $state(null);
  let t = $state(0);
  let playing = $state(true);
  let cycleSeconds = $state(6);

  const geom = $derived.by(() => {
    const src = imageState.source;
    const r = selectionState.rect;
    if (!src || !r) return null;
    return drosteGeometry({ width: src.width, height: src.height }, r);
  });

  $effect(() => {
    if (!canvas || !imageState.source) return;
    const src = imageState.source;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
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
    // Deps for reactivity:
    void t;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a1016';
    ctx.fillRect(0, 0, W, H);

    // Map canvas coords ↔ image coords. We show the full image fit-to-canvas
    // (letterboxed), then crop/zoom around c in image space.
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

    const z = Math.pow(g.S, t);
    // Source window in image pixels.
    const sw = src.width / z;
    const sh = src.height / z;
    const sx = g.limit.x * (1 - 1 / z);
    const sy = g.limit.y * (1 - 1 / z);

    ctx.save();
    ctx.beginPath();
    ctx.rect(offX, offY, fitW, fitH);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    try {
      ctx.drawImage(src.bitmap, sx, sy, sw, sh, offX, offY, fitW, fitH);
    } catch {
      // If the window falls outside the image (c far outside), drawImage may throw.
      // Fallback: draw full image.
      ctx.drawImage(src.bitmap, offX, offY, fitW, fitH);
    }
    ctx.restore();
  });

  function togglePlay() {
    playing = !playing;
  }
  function reset() {
    t = 0;
  }
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
        <input
          type="range"
          min="1"
          max="20"
          step="0.5"
          bind:value={cycleSeconds}
        />
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
    <canvas bind:this={canvas} class="view" style="aspect-ratio: {imageState.source.width} / {imageState.source.height};"
    ></canvas>
    <p class="muted hint">
      The image is sampled at scale S<sup>t</sup> around the limit point. Because the
      rectangle you placed is self-similar, the loop closes at t = 1.
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
