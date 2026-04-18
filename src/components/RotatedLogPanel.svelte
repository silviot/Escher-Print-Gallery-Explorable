<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import { renderMappedDroste, maxCornerRadius } from '../lib/math/transforms';

  const W = 840;
  const H = 280;
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

    // Rotate (u, v) space by a = atan(logS / 2π) so the Droste-repeat vector
    // (logS, 2π) lands on the v'-axis with length L. In the display, v' is
    // vertical → the Droste repeat runs top-to-bottom.
    const a = Math.atan2(g.logS, 2 * Math.PI);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const L = Math.hypot(g.logS, 2 * Math.PI);

    const cx = g.limit.x;
    const cy = g.limit.y;
    const uSpan = ur.uMax - ur.uMin;
    const droste = { cx, cy, logS: g.logS, rMax: ur.rMax };

    const out = ctx.createImageData(W, H);
    renderMappedDroste(out, src.pixels, droste, (px, py, s) => {
      // Horizontal: u' log-radius axis in the rotated frame.
      // Vertical: v' ∈ [-L/2, L/2] — exactly one Droste period.
      const uPrime = ur.uMin + (px / (W - 1)) * uSpan;
      const vPrime = -L / 2 + (py / (H - 1)) * L;
      // Inverse-rotate to the plain log frame: (u, v) = R(-a) · (u', v')
      const u = uPrime * cosA + vPrime * sinA;
      const v = -uPrime * sinA + vPrime * cosA;
      const r = Math.exp(u);
      s.x = cx + r * Math.cos(v);
      s.y = cy + r * Math.sin(v);
      return true;
    });
    ctx.putImageData(out, 0, 0);

    // The canvas is exactly one Droste period tall: top and bottom rows show
    // the same source pixels. Draw a subtle marker at the vertical midline
    // (v' = 0) as a reference for where the rotation-free horizon sits.
    ctx.strokeStyle = 'rgba(255, 184, 92, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2 + 0.5);
    ctx.lineTo(W, H / 2 + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });
</script>

<section class="panel">
  <header>
    <h2>log(z − c), rotated by α</h2>
    {#if geom}
      {@const a = Math.atan2(geom.logS, 2 * Math.PI)}
      {@const L = Math.hypot(geom.logS, 2 * Math.PI)}
      <div class="chips mono">
        <span class="chip" title="Droste rotation angle">
          α = {(a * 180 / Math.PI).toFixed(2)}°
        </span>
        <span class="chip" title="tan α = logS / 2π">
          tan α = logS / 2π = {(geom.logS / (2 * Math.PI)).toFixed(3)}
        </span>
        <span class="chip" title="Vertical Droste period after rotation">
          period = L = {L.toFixed(3)}
        </span>
      </div>
    {/if}
  </header>
  <canvas bind:this={canvas} style="width: {W}px; max-width: 100%; height: auto;"></canvas>
  <p class="muted hint">
    Same log strip, rotated by α = atan(logS / 2π). After the rotation, the
    Droste lattice vector (logS, 2π) stands along the vertical with length
    L = √(logS² + 4π²); the canvas is exactly one period tall, so top and
    bottom rows coincide. Apply exp to this strip and it winds into the
    Escher spiral below.
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
