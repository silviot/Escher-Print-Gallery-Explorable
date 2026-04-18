<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import { renderMapped } from '../lib/math/transforms';

  const W = 720;
  const H = 240;
  const N_PERIODS = 3;

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
    let maxR = 0;
    for (const [x, y] of [
      [0, 0],
      [src.width, 0],
      [0, src.height],
      [src.width, src.height]
    ] as const) {
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

    // Droste rotation angle: a = atan(logS / 2π). The vector (logS, 2π) — the
    // Droste-repeat direction in (u, v) space — rotates onto the v-axis, so
    // after this rotation the spiral's stripes stand vertical.
    const a = Math.atan2(g.logS, 2 * Math.PI);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    const cx = g.limit.x;
    const cy = g.limit.y;
    const uSpan = ur.uMax - ur.uMin;

    const out = ctx.createImageData(W, H);
    renderMapped(out, src.pixels, (px, py, s) => {
      // canvas pixel → (u', v') in the rotated-log frame
      const vPrime = -Math.PI + (px / (W - 1)) * 2 * Math.PI;
      const uPrime = ur.uMax - (py / (H - 1)) * uSpan;
      // inverse-rotate to the plain log frame: (u, v) = R(-a) · (u', v')
      const u = uPrime * cosA + vPrime * sinA;
      const v = -uPrime * sinA + vPrime * cosA;
      const r = Math.exp(u);
      s.x = cx + r * Math.cos(v);
      s.y = cy + r * Math.sin(v);
      return true;
    });
    ctx.putImageData(out, 0, 0);

    // Period-markers: Droste vector (logS, 2π) now runs vertically with length
    // L = sqrt(logS² + 4π²). Draw one period downwards from the top.
    const L = Math.hypot(g.logS, 2 * Math.PI);
    const periodPx = (L / uSpan) * (H - 1);
    ctx.strokeStyle = 'rgba(255, 184, 92, 0.55)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, periodPx + 0.5);
    ctx.lineTo(W, periodPx + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });
</script>

<section class="panel">
  <header>
    <h2>log(z − c), rotated by α</h2>
    {#if geom}
      {@const a = Math.atan2(geom.logS, 2 * Math.PI)}
      <div class="chips mono">
        <span class="chip" title="Droste rotation angle">
          α = {(a * 180 / Math.PI).toFixed(2)}°
        </span>
        <span class="chip" title="tan α = logS / 2π">
          tan α = logS / 2π = {(geom.logS / (2 * Math.PI)).toFixed(3)}
        </span>
      </div>
    {/if}
  </header>
  <canvas bind:this={canvas} style="width: {W}px; max-width: 100%; height: auto;"></canvas>
  <p class="muted hint">
    Same log strip, rotated by α = atan(logS / 2π). The Droste lattice
    vector (logS, 2π) lands on the vertical axis with length
    L = √(logS² + 4π²); the dashed line marks one period downward.
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
