<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import { renderMapped } from '../lib/math/transforms';

  const MAX_W = 560;

  let canvas: HTMLCanvasElement | null = $state(null);

  const geom = $derived.by(() => {
    const src = imageState.source;
    const r = selectionState.rect;
    if (!src || !r) return null;
    return drosteGeometry({ width: src.width, height: src.height }, r);
  });

  const dims = $derived.by(() => {
    const src = imageState.source;
    if (!src) return null;
    const scale = Math.min(1, MAX_W / src.width);
    return {
      W: Math.round(src.width * scale),
      H: Math.round(src.height * scale),
      scale
    };
  });

  $effect(() => {
    const src = imageState.source;
    const g = geom;
    const d = dims;
    if (!src || !g || !d || !canvas) return;

    canvas.width = d.W;
    canvas.height = d.H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Escher power: α = 1 - i · k, with k = logS / (2π). Inverse 1/α = μ + iν.
    const k = g.logS / (2 * Math.PI);
    const denom = 1 + k * k;
    const mu = 1 / denom;
    const nu = k / denom;
    const cx = g.limit.x;
    const cy = g.limit.y;

    const out = ctx.createImageData(d.W, d.H);
    renderMapped(out, src.pixels, (px, py, s) => {
      // Output canvas pixel → image coord
      const x = px / d.scale;
      const y = py / d.scale;
      const dx = x - cx;
      const dy = y - cy;
      const R2 = dx * dx + dy * dy;
      if (R2 < 1e-12) return false;
      const lnR = 0.5 * Math.log(R2);
      const Phi = Math.atan2(dy, dx);
      // (1/α) · (lnR + iΦ) = (μ lnR − ν Φ) + i (ν lnR + μ Φ)
      const uu = mu * lnR - nu * Phi;
      const vv = nu * lnR + mu * Phi;
      const r = Math.exp(uu);
      s.x = cx + r * Math.cos(vv);
      s.y = cy + r * Math.sin(vv);
      return true;
    });
    ctx.putImageData(out, 0, 0);

    // Mark the limit point c if visible. Same warm colour as in the picker.
    const lx = cx * d.scale;
    const ly = cy * d.scale;
    if (lx >= 0 && lx <= d.W && ly >= 0 && ly <= d.H) {
      ctx.strokeStyle = 'rgba(255, 184, 92, 0.9)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.moveTo(lx - 9, ly);
      ctx.lineTo(lx + 9, ly);
      ctx.moveTo(lx, ly - 9);
      ctx.lineTo(lx, ly + 9);
      ctx.stroke();
    }
  });
</script>

<section class="panel">
  <header>
    <h2>Escher: (z − c)<sup>α</sup></h2>
    {#if geom}
      {@const k = geom.logS / (2 * Math.PI)}
      <div class="chips mono">
        <span class="chip" title="Escher exponent">α = 1 − {k.toFixed(3)}i</span>
        <span class="chip" title="Rotation per decade of radius">|α| = {Math.sqrt(1 + k * k).toFixed(3)}</span>
      </div>
    {/if}
  </header>
  <canvas bind:this={canvas}></canvas>
  <p class="muted hint">
    Output pixel p maps to source pixel c + (p − c)<sup>1/α</sup>. Following a
    circle around c once multiplies the sampled radius by S, so the picture
    winds into its own reduced copy. The pattern repeats under the Droste
    zoom: scale by S, and the image matches itself exactly.
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
    image-rendering: auto;
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
