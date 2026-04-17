<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState, initSelection } from '../lib/stores/selection.svelte';
  import { drosteGeometry } from '../lib/math/droste';
  import RectanglePicker from './RectanglePicker.svelte';

  let canvas: HTMLCanvasElement | null = $state(null);

  // Re-init selection whenever a new image loads.
  $effect(() => {
    const src = imageState.source;
    if (src) initSelection({ width: src.width, height: src.height });
  });

  // Draw image onto the backing canvas once, in image-pixel space. CSS scales it.
  $effect(() => {
    const src = imageState.source;
    if (!src || !canvas) return;
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src.bitmap, 0, 0);
  });

  const geom = $derived.by(() => {
    const src = imageState.source;
    const r = selectionState.rect;
    if (!src || !r) return null;
    return drosteGeometry({ width: src.width, height: src.height }, r);
  });
</script>

<section class="source">
  <header>
    <h2>Source + inner rectangle</h2>
    {#if geom}
      <div class="chips mono">
        <span class="chip" title="Scale factor">S = {geom.S.toFixed(2)}</span>
        <span class="chip" title="Natural log of S">log S = {geom.logS.toFixed(3)}</span>
        <span class="chip" class:outside={
          geom.limit.x < 0 || geom.limit.x > (imageState.source?.width ?? 0) ||
          geom.limit.y < 0 || geom.limit.y > (imageState.source?.height ?? 0)
        } title="Limit point (pixel coords)">
          c = ({geom.limit.x.toFixed(0)}, {geom.limit.y.toFixed(0)})
        </span>
      </div>
    {/if}
  </header>

  {#if imageState.source}
    {@const src = imageState.source}
    <RectanglePicker image={{ width: src.width, height: src.height }}>
      <canvas bind:this={canvas} class="img"></canvas>
    </RectanglePicker>
    <p class="hint muted">
      Drag the rectangle to translate · drag a corner to scale (aspect-locked) ·
      <span class="dot warm"></span> marks the limit point
    </p>
  {:else if imageState.loading}
    <p class="muted">Loading image…</p>
  {:else}
    <p class="muted">No image yet. Upload one above.</p>
  {/if}
</section>

<style>
  .source {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 960px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
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
  .chip.outside {
    border-color: var(--green);
    color: var(--green);
  }
  .img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .hint {
    font-size: 0.85rem;
  }
  .dot {
    display: inline-block;
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    vertical-align: middle;
    margin: 0 0.2em;
  }
  .dot.warm { background: var(--warm); }
</style>
