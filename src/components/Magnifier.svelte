<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState } from '../lib/stores/selection.svelte';
  import { interactionState } from '../lib/stores/interaction.svelte';

  const SIZE = 220; // CSS pixels, square

  let canvas: HTMLCanvasElement | null = $state(null);

  // Pick a zoom that scales up with S so that even at extreme zoom
  // the handles remain several CSS-pixels wide in the loupe.
  const zoom = $derived.by(() => {
    const r = selectionState.rect;
    const src = imageState.source;
    if (!r || !src) return 4;
    const S = src.width / r.w;
    return Math.max(2, Math.min(40, S * 0.8));
  });

  // Focus the loupe on the pointer/active-corner when available,
  // otherwise on the rectangle centre.
  const focus = $derived.by(() => {
    if (interactionState.focus) return interactionState.focus;
    const r = selectionState.rect;
    if (!r) return null;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });

  $effect(() => {
    const src = imageState.source;
    const f = focus;
    const r = selectionState.rect;
    if (!canvas || !src || !f) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Source window in image pixels, centred at focus.
    const winW = SIZE / zoom;
    const winH = SIZE / zoom;
    const sx = f.x - winW / 2;
    const sy = f.y - winH / 2;

    // Background (for area that falls outside the source image)
    ctx.fillStyle = '#0a1016';
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.drawImage(src.bitmap, sx, sy, winW, winH, 0, 0, SIZE, SIZE);

    // Overlay: rectangle + handles in loupe-local pixel coords.
    if (r) {
      const toLoupe = (p: { x: number; y: number }) => ({
        x: (p.x - sx) * zoom,
        y: (p.y - sy) * zoom
      });
      const tl = toLoupe({ x: r.x, y: r.y });
      const br = toLoupe({ x: r.x + r.w, y: r.y + r.h });
      ctx.strokeStyle = 'rgba(88, 196, 221, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

      ctx.fillStyle = '#101820';
      ctx.strokeStyle = 'rgba(88, 196, 221, 1)';
      ctx.lineWidth = 1.5;
      for (const corner of [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h }
      ]) {
        const p = toLoupe(corner);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Crosshair at the loupe centre so the user always knows which point is focused.
    ctx.strokeStyle = 'rgba(255, 184, 92, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 8, SIZE / 2);
    ctx.lineTo(SIZE / 2 + 8, SIZE / 2);
    ctx.moveTo(SIZE / 2, SIZE / 2 - 8);
    ctx.lineTo(SIZE / 2, SIZE / 2 + 8);
    ctx.stroke();
  });
</script>

<aside class="magnifier">
  <header>
    <h3>Loupe</h3>
    <span class="mono zoom">×{zoom.toFixed(1)}</span>
  </header>
  <canvas bind:this={canvas} width={SIZE} height={SIZE} style="width: {SIZE}px; height: {SIZE}px;"></canvas>
  <p class="muted hint">Follows cursor · locks to the active handle while dragging.</p>
</aside>

<style>
  .magnifier {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 0 0 auto;
  }
  .magnifier h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--teal);
    letter-spacing: 0.02em;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  canvas {
    display: block;
    border: 1px solid var(--border);
    background: var(--bg);
    image-rendering: pixelated;
  }
  .zoom {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .hint {
    font-size: 0.75rem;
    max-width: 220px;
    margin: 0;
  }
</style>
