<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import { renderMapped } from '../lib/math/transforms';

  const W = 720;
  const H = 240;
  const N_PERIODS = 3; // how many Droste periods deep to unroll

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
    const c = g.limit;
    const corners = [
      [0, 0],
      [src.width, 0],
      [0, src.height],
      [src.width, src.height]
    ] as const;
    let maxR = 0;
    for (const [x, y] of corners) {
      const r = Math.hypot(x - c.x, y - c.y);
      if (r > maxR) maxR = r;
    }
    const uMax = Math.log(Math.max(maxR, 1));
    const uMin = uMax - N_PERIODS * g.logS;
    return { uMin, uMax };
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

    renderMapped(out, src.pixels, (px, py, s) => {
      // px → angle v ∈ [-π, π]; py → log-radius u with uMax at top
      const v = -Math.PI + (px / (W - 1)) * 2 * Math.PI;
      const u = ur.uMax - (py / (H - 1)) * uSpan;
      const r = Math.exp(u);
      s.x = cx + r * Math.cos(v);
      s.y = cy + r * Math.sin(v);
      return true;
    });
    ctx.putImageData(out, 0, 0);

    // Droste period markers: horizontal lines at u = uMax − n·logS.
    ctx.strokeStyle = 'rgba(255, 184, 92, 0.55)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (let n = 1; n < N_PERIODS; n++) {
      const y = ((n * g.logS) / uSpan) * (H - 1);
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
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
        <span class="chip" title="Vertical span in log-radius units">
          u ∈ [{uRange.uMin.toFixed(2)}, {uRange.uMax.toFixed(2)}]
        </span>
        <span class="chip" title="Height of one Droste period in log units">
          period = logS = {geom.logS.toFixed(3)}
        </span>
      </div>
    {/if}
  </header>
  <canvas bind:this={canvas} style="width: {W}px; max-width: 100%; height: auto;"></canvas>
  <p class="muted hint">
    Horizontal: angle v around the limit point (−π to π, wraps).
    Vertical: log-radius u, with larger radii at the top.
    A Droste image repeats every logS downward (dashed lines); combined
    with the 2π angle wrap, the self-similarity lattice is (logS, 2π).
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
