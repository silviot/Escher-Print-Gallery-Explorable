<script lang="ts">
  /**
   * Live spiral preview for /ui1.
   *
   * Owns the GPU spiral renderer (createEscherZoomRenderer) and a single
   * canvas. Re-renders whenever doc.rect / doc.image / playback.t change,
   * which means the user sees the live result as they drag the rect on
   * the editing canvas to the left.
   *
   * Render-only: no pointer handlers, no overlay. CanvasStage owns all
   * editing interactions; we just visualise the consequence.
   *
   * Exposes the live canvas + a per-frame render fn to the parent so the
   * export menu (MP4 captureStream / GIF off-screen render) can hook in
   * without re-implementing the renderer plumbing.
   */

  import { doc, playback, ui, shapeAnim } from '../../lib/ui1/state.svelte';
  import { createEscherZoomRenderer } from '../../lib/render/escher-zoom';
  import { buildRenderInputs, extractPixels } from '../../lib/ui1/render';

  type Props = {
    bindCanvas?: (canvas: HTMLCanvasElement | null) => void;
    bindRenderFrame?: (fn: (off: HTMLCanvasElement, t: number) => Promise<void>) => void;
  };
  let { bindCanvas, bindRenderFrame }: Props = $props();

  let viewport: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let pixels: ImageData | null = $state(null);
  let renderer: ReturnType<typeof createEscherZoomRenderer> | null = $state(null);
  let viewW = $state(0);
  let viewH = $state(0);

  // Preview canvas is letterboxed to the CROP's aspect — the working
  // frame the renderer is actually sampling. Before a rect/crop is set
  // we fall back to the image aspect so the empty-state placeholder
  // still has a sensible footprint.
  const fit = $derived.by(() => {
    if (!doc.image || viewW <= 0 || viewH <= 0) return null;
    const c = doc.crop;
    const aw = c ? c.w : doc.image.width;
    const ah = c ? c.h : doc.image.height;
    const ia = aw / ah;
    const va = viewW / viewH;
    let w: number, h: number;
    if (va > ia) { h = viewH; w = h * ia; } else { w = viewW; h = w / ia; }
    return {
      w,
      h,
      offX: (viewW - w) / 2,
      offY: (viewH - h) / 2
    };
  });

  const hasRect = $derived(doc.rect.w > 0 && doc.rect.h > 0);

  $effect(() => {
    if (!viewport) return;
    const update = () => {
      const r = viewport!.getBoundingClientRect();
      viewW = r.width;
      viewH = r.height;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!doc.image) { pixels = null; return; }
    pixels = extractPixels(doc.image);
  });

  $effect(() => {
    if (!canvas) {
      renderer = null;
      bindCanvas?.(null);
      return;
    }
    const r = createEscherZoomRenderer();
    renderer = r;
    void r.init(canvas);
    bindCanvas?.(canvas);
    bindRenderFrame?.(renderFrameToOffscreen);
    return () => {
      r.dispose();
      renderer = null;
      bindCanvas?.(null);
    };
  });

  $effect(() => {
    if (!renderer || !canvas || !doc.image || !pixels || !fit || !hasRect || !doc.crop) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(fit.w * dpr));
    const h = Math.max(1, Math.round(fit.h * dpr));
    void playback.t;
    void shapeAnim.morph; // re-render as the shape morphs (also read inside buildRenderInputs)
    const inputs = buildRenderInputs(pixels, doc.rect, doc.crop, w, h);
    if (!inputs) return;
    renderer.render(inputs);
  });

  // Animation clock — advances t while playing.
  //
  // Gated on !playback.exporting so the live preview's rAF + WebGL render
  // doesn't fight the export pipeline for the GPU while a PNG/MP4 is being
  // produced. The export modal covers the preview anyway, so freezing it
  // is invisible to the user and frees the GPU for the export renderer.
  const MAX_DT = 1 / 30;
  $effect(() => {
    if (!playback.playing || playback.exporting) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      playback.t = (playback.t + (dt * playback.speed) / playback.loopLength) % 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  /**
   * Render one frame to the given off-screen canvas at raw progress t
   * (0..1). Used by the video export.
   *
   * Two non-obvious things:
   *
   *  - webgl2-main tier (not cpu-main). The CPU renderer is ~100–500 ms
   *    per frame on a non-trivial image; a wall-clock-paced 10 s loop
   *    barely got six frames in before timing out. GPU on the main
   *    thread is ~5 ms per frame and lets the rAF loop run at 60 Hz.
   *    The factory still falls back to CPU if WebGL2 is unavailable.
   *
   *  - Renderer is cached per canvas across frames. Re-initialising on
   *    every frame would compile shaders and re-upload the texture each
   *    time. We keep the same renderer until the export canvas changes
   *    (each export creates a fresh hidden canvas) and dispose then.
   *    Last renderer disposes on component unmount.
   */
  let exportRenderer: ReturnType<typeof createEscherZoomRenderer> | null = null;
  let exportCanvasRef: HTMLCanvasElement | null = null;

  async function renderFrameToOffscreen(off: HTMLCanvasElement, t: number): Promise<void> {
    if (!doc.image || !pixels || !doc.crop) return;
    if (exportCanvasRef !== off) {
      exportRenderer?.dispose();
      exportRenderer = createEscherZoomRenderer({ forceTier: 'webgl2-main' });
      await exportRenderer.init(off);
      exportCanvasRef = off;
    }
    const u = buildRenderInputs(pixels, doc.rect, doc.crop, off.width, off.height);
    if (!u || !exportRenderer) return;
    // Renderer t advances outward (see effectiveT in lib/ui1/render.ts),
    // so 'in' takes the mirror.
    const effT = playback.direction === 'in' ? 1 - t : t;
    exportRenderer.render({ ...u, t: effT });
  }

  $effect(() => {
    return () => {
      exportRenderer?.dispose();
      exportRenderer = null;
      exportCanvasRef = null;
    };
  });
</script>

<section class="preview" aria-label="Spiral preview">
  <div class="stage-label">Spiral preview</div>
  <div class="viewport" bind:this={viewport}>
    {#if doc.image}
      <canvas
        bind:this={canvas}
        class:visible={hasRect}
        style:left="{fit?.offX ?? 0}px"
        style:top="{fit?.offY ?? 0}px"
        style:width="{fit?.w ?? 0}px"
        style:height="{fit?.h ?? 0}px"
      ></canvas>
      {#if !hasRect}
        <div class="hint mono">Draw a frame in Edit to see your spiral.</div>
      {/if}
    {:else}
      <div class="hint mono">Load an image first.</div>
    {/if}
  </div>
</section>

<style>
  .preview {
    flex: 1;
    min-width: 0;
    background: var(--canvas-bg);
    position: relative;
    overflow: hidden;
    display: flex;
    border-left: 1px solid var(--border);
  }
  .viewport {
    position: absolute;
    inset: 8px;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  canvas {
    position: absolute;
    display: block;
    opacity: 0;
    transition: opacity 120ms;
  }
  canvas.visible { opacity: 1; }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
  }
</style>
