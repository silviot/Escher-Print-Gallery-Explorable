<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import { renderMappedDroste, maxCornerRadius } from '../lib/math/transforms';

  const W = 840;
  const H = 280;
  const N_PERIODS = 3; // how many Droste periods to span horizontally

  let canvas: HTMLCanvasElement | null = $state(null);

  const geom = $derived.by(() => {
    const src = imageState.source;
    const r = selectionState.rect;
    if (!src || !r) return null;
    return drosteGeometry({ width: src.width, height: src.height }, r);
  });

  const uRange = $derived.by(() => {
    const src = imageState.source;
    const g = geom;
    if (!src || !g) return null;
    const rMax = maxCornerRadius(src.width, src.height, g.limit.x, g.limit.y);
    const uMax = Math.log(Math.max(rMax, 1));
    const uMin = uMax - N_PERIODS * g.logS;
    return { uMin, uMax, rMax };
  });

  $effect(() => {
    const src = imageState.source;
    const g = geom;
    const ur = uRange;
    if (!src || !g || !ur || !canvas) return;

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const out = ctx.createImageData(W, H);
    const cx = g.limit.x;
    const cy = g.limit.y;
    const uSpan = ur.uMax - ur.uMin;
    const droste = { cx, cy, logS: g.logS, rMax: ur.rMax };

    renderMappedDroste(out, src.pixels, droste, (px, py, s) => {
      // Horizontal: log-radius u, with larger radii at the right.
      // Vertical: angle v ∈ [-π, π], wrapping top to bottom.
      const u = ur.uMin + (px / (W - 1)) * uSpan;
      const v = -Math.PI + (py / (H - 1)) * 2 * Math.PI;
      const r = Math.exp(u);
      s.x = cx + r * Math.cos(v);
      s.y = cy + r * Math.sin(v);
      return true;
    });
    ctx.putImageData(out, 0, 0);

    // Droste period markers: VERTICAL dashed lines at u = uMax − n·logS.
    ctx.strokeStyle = 'rgba(255, 184, 92, 0.55)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (let n = 1; n < N_PERIODS; n++) {
      const u = ur.uMax - n * g.logS;
      const x = ((u - ur.uMin) / uSpan) * (W - 1);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
</script>

<section class="panel">
  <header>
    <h2>log(z − c)</h2>
    {#if geom && uRange}
      <div class="chips mono">
        <span class="chip" title="Horizontal span in log-radius units">
          u ∈ [{uRange.uMin.toFixed(2)}, {uRange.uMax.toFixed(2)}]
        </span>
        <span class="chip" title="Width of one Droste period in log units">
          period = logS = {geom.logS.toFixed(3)}
        </span>
      </div>
    {/if}
  </header>
  <canvas bind:this={canvas} style="width: {W}px; max-width: 100%; height: auto;"></canvas>
  <p class="muted hint">
    Horizontal: log-radius u around the limit point c, larger radii at the right.
    Vertical: angle v ∈ [−π, π], wrapping top to bottom. The image is tiled by
    its own Droste self-similarity: every (u, v) is folded into the outermost
    ring, so any column here is one complete radial slice of the picture.
    Dashed verticals mark u = uMax − n·logS, one Droste period apart.
  </p>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 1240px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
  }
  canvas {
    display: block;
    border: 1px solid var(--border);
    background: var(--bg);
    image-rendering: pixelated;
  }
  .chips {
    display: flex;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .chip {
    padding: 0.2em 0.55em;
    border: 1px solid var(--border);
    color: var(--fg);
  }
  .hint {
    font-size: 0.85rem;
    max-width: 720px;
  }
</style>
