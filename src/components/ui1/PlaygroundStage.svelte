<script lang="ts">
  /**
   * Complex-playground stage: the source image warped by the active complex
   * function f(z), rendered on the GPU (PlaygroundGLRenderer) with a CPU
   * fallback. Hand-drag adds the complex pan constant `c`; the wheel zooms.
   * An SVG overlay draws the z = 0 origin, the unit circle, and draggable
   * handles for a preset's complex points (e.g. a Möbius zero/pole) — the
   * GeoGebra-style direct manipulation.
   *
   * Mounted in every view; inert (0×0 viewport, no render) unless
   * ui.view === 'playground'.
   */

  import { doc, ui } from '../../lib/ui1/state.svelte';
  import { playground } from '../../lib/ui1/playground.svelte';
  import { pixelsFor } from '../../lib/ui1/pixels-cache';
  import { detectCapabilities } from '../../lib/render/capabilities';
  import { PlaygroundGLRenderer } from '../../lib/render/playground/gl';
  import { renderPlaygroundCpu } from '../../lib/render/playground/cpu';
  import {
    PRESET_BY_ID,
    formulaText,
    type Complex,
    type ComplexParam
  } from '../../lib/render/playground/presets';

  const useGL = detectCapabilities().webgl2;
  const MAX_PX = useGL ? 1280 : 480;

  let viewport: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let viewW = $state(0);
  let viewH = $state(0);
  let glRenderer = $state<PlaygroundGLRenderer | null>(null);
  // WebGL2 was advertised by detectCapabilities but init threw anyway (shader
  // link / context allocation). Flip to the CPU path instead of rendering
  // nothing forever.
  let glInitFailed = $state(false);

  const active = $derived(ui.view === 'playground');
  const preset = $derived(PRESET_BY_ID[playground.presetId]);
  const aspect = $derived(doc.image ? doc.image.width / doc.image.height : 1);
  const halfX = $derived(Math.max(aspect, 1));

  // Canvas footprint, letter-boxed to the image aspect so identity = passthrough.
  const fit = $derived.by(() => {
    if (!doc.image || viewW <= 0 || viewH <= 0) return null;
    const va = viewW / viewH;
    let w: number;
    let h: number;
    if (va > aspect) { h = viewH; w = h * aspect; } else { w = viewW; h = w / aspect; }
    return { w, h, offX: (viewW - w) / 2, offY: (viewH - h) / 2 };
  });

  // CSS px per complex unit (equal on both axes — canvas matches image aspect).
  const viewUnit = $derived(fit ? (fit.w * playground.zoom) / (2 * halfX) : 1);

  const formula = $derived(
    preset ? formulaText(preset, playground.params, playground.c, playground.panMode) : ''
  );

  // Draggable complex points, positioned on the *visible* feature: in domain
  // mode the picture shows f(z + c), so a param at value `v` appears at z = v − c.
  type Handle = { id: string; label: string; x: number; y: number };
  const handles = $derived.by<Handle[]>(() => {
    if (!preset || !fit) return [];
    const out: Handle[] = [];
    for (const def of preset.params) {
      if (def.kind !== 'complex' || !def.draggable) continue;
      const v = playground.params[def.id] as Complex;
      const z =
        playground.panMode === 'domain' ? { re: v.re - playground.c.re, im: v.im - playground.c.im } : v;
      out.push({
        id: def.id,
        label: (def as ComplexParam).label,
        x: fit.w / 2 + z.re * viewUnit,
        y: fit.h / 2 - z.im * viewUnit
      });
    }
    return out;
  });

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

  // GPU renderer lifecycle (GL backend only).
  $effect(() => {
    if (!canvas || !useGL) {
      glRenderer?.dispose();
      glRenderer = null;
      return;
    }
    let r: PlaygroundGLRenderer | null = null;
    try {
      r = new PlaygroundGLRenderer();
      r.init(canvas);
      glRenderer = r;
      glInitFailed = false;
    } catch {
      r?.dispose();
      glRenderer = null;
      glInitFailed = true; // fall through to the CPU path
    }
    return () => {
      r?.dispose();
      glRenderer = null;
    };
  });

  function paintCpu(out: ImageData): void {
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    if (canvas.width !== out.width) canvas.width = out.width;
    if (canvas.height !== out.height) canvas.height = out.height;
    ctx2d.putImageData(out, 0, 0);
  }

  // rAF-coalesced render. Reads every reactive input synchronously so the
  // effect re-runs on any change (mirrors PipelinePanel's tracking note).
  $effect(() => {
    if (!active || !canvas || !fit || !doc.image || !preset) return;
    // Use GL only if it's available AND actually initialized. If init failed,
    // tryGL is false and we render through the CPU path below.
    const tryGL = useGL && !glInitFailed;
    if (tryGL && !glRenderer) return; // still bringing the renderer up
    const f = fit;
    const dpr = window.devicePixelRatio || 1;
    let cw = Math.max(1, Math.round(f.w * dpr));
    let ch = Math.max(1, Math.round(f.h * dpr));
    const longSide = Math.max(cw, ch);
    if (longSide > MAX_PX) {
      const s = MAX_PX / longSide;
      cw = Math.max(1, Math.round(cw * s));
      ch = Math.max(1, Math.round(ch * s));
    }
    const pixels = pixelsFor(doc.image);
    const mode = preset.mode;
    const uniforms = preset.uniforms(playground.params);
    const c: [number, number] = [playground.c.re, playground.c.im];
    const cObj = { re: playground.c.re, im: playground.c.im };
    const panMode = playground.panMode;
    const zoom = playground.zoom;
    const fill = playground.fill;
    const params = playground.params;

    const raf = requestAnimationFrame(() => {
      if (tryGL && glRenderer) {
        glRenderer.render({
          pixels, mode, W: cw, H: ch, imgAspect: aspect, zoom,
          c, panMode: panMode === 'domain' ? 0 : 1, uniforms, fill
        });
        return;
      }
      const out = renderPlaygroundCpu({
        pixels, preset, params, W: cw, H: ch, imgAspect: aspect, zoom, c: cObj, panMode, fill
      });
      paintCpu(out);
    });
    return () => cancelAnimationFrame(raf);
  });

  // --- hand-drag → pan constant c (content follows the cursor) ----------
  let panStart: { x: number; y: number; c: Complex } | null = null;
  function onDown(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    panStart = { x: e.clientX, y: e.clientY, c: { ...playground.c } };
  }
  function onMove(e: PointerEvent) {
    if (!panStart) return;
    const dRe = (e.clientX - panStart.x) / viewUnit;
    const dIm = -(e.clientY - panStart.y) / viewUnit;
    playground.c = { re: panStart.c.re - dRe, im: panStart.c.im - dIm };
  }
  function onUp() {
    panStart = null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    playground.zoom = Math.min(50, Math.max(0.1, playground.zoom * factor));
  }

  // --- draggable handle → complex param ---------------------------------
  let dragId: string | null = null;
  function onHandleDown(e: PointerEvent, id: string) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragId = id;
  }
  function onHandleMove(e: PointerEvent) {
    if (!dragId || !fit || !viewport) return;
    e.stopPropagation();
    // Pointer relative to the canvas top-left (canvas sits at fit.offX/offY).
    const rect = viewport.getBoundingClientRect();
    const cssX = e.clientX - rect.left - fit.offX;
    const cssY = e.clientY - rect.top - fit.offY;
    const zRe = (cssX - fit.w / 2) / viewUnit;
    const zIm = -(cssY - fit.h / 2) / viewUnit;
    const v =
      playground.panMode === 'domain'
        ? { re: zRe + playground.c.re, im: zIm + playground.c.im }
        : { re: zRe, im: zIm };
    playground.params[dragId] = v;
  }
  function onHandleUp(e: PointerEvent) {
    if (dragId) e.stopPropagation();
    dragId = null;
  }
</script>

<section class="playground-stage">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    bind:this={viewport}
    onpointerdown={onDown}
    onpointermove={(e) => { onMove(e); onHandleMove(e); }}
    onpointerup={(e) => { onUp(); onHandleUp(e); }}
    onpointercancel={(e) => { onUp(); onHandleUp(e); }}
    onwheel={onWheel}
  >
    {#if doc.image && fit}
      <canvas
        bind:this={canvas}
        style:left="{fit.offX}px"
        style:top="{fit.offY}px"
        style:width="{fit.w}px"
        style:height="{fit.h}px"
      ></canvas>

      <svg
        class="overlay"
        style:left="{fit.offX}px"
        style:top="{fit.offY}px"
        style:width="{fit.w}px"
        style:height="{fit.h}px"
        viewBox="0 0 {fit.w} {fit.h}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <!-- unit circle |z| = 1 and the z = 0 origin -->
        <circle cx={fit.w / 2} cy={fit.h / 2} r={viewUnit} class="unit" />
        <line x1={fit.w / 2 - 7} y1={fit.h / 2} x2={fit.w / 2 + 7} y2={fit.h / 2} class="origin" />
        <line x1={fit.w / 2} y1={fit.h / 2 - 7} x2={fit.w / 2} y2={fit.h / 2 + 7} class="origin" />
        {#each handles as h (h.id)}
          <g class="handle" onpointerdown={(e) => onHandleDown(e, h.id)}>
            <circle cx={h.x} cy={h.y} r="9" class="hit" />
            <circle cx={h.x} cy={h.y} r="6" class="dot" />
            <text x={h.x + 11} y={h.y - 9} class="htext">{h.label}</text>
          </g>
        {/each}
      </svg>

      <div class="formula mono">{formula}</div>
      <div class="zoomchip mono">{playground.zoom.toFixed(2)}×</div>
    {/if}
  </div>
</section>

<style>
  .playground-stage {
    min-width: 0;
    min-height: 0;
    background: var(--canvas-bg);
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
  }
  .viewport {
    position: absolute;
    inset: 6px;
    border-radius: 4px;
    overflow: hidden;
    background: #000;
    cursor: grab;
    touch-action: none;
  }
  .viewport:active { cursor: grabbing; }
  canvas {
    position: absolute;
    display: block;
    image-rendering: auto;
  }
  .overlay {
    position: absolute;
    pointer-events: none;
    overflow: visible;
    filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9));
  }
  .overlay .unit {
    fill: none;
    stroke: rgba(255, 255, 255, 0.28);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  .overlay .origin { stroke: rgba(255, 255, 255, 0.7); stroke-width: 1.4; }
  .handle { pointer-events: all; cursor: grab; }
  .handle:active { cursor: grabbing; }
  .handle .hit { fill: transparent; }
  .handle .dot {
    fill: var(--accent);
    stroke: #fff;
    stroke-width: 1.5;
  }
  .handle .htext {
    fill: #fff;
    font-family: var(--font-mono);
    font-size: 11px;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.7);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .formula {
    position: absolute;
    left: 10px;
    top: 10px;
    max-width: calc(100% - 20px);
    font-size: 13px;
    color: #fff;
    background: rgba(0, 0, 0, 0.58);
    padding: 5px 9px;
    border-radius: 6px;
    pointer-events: none;
  }
  .zoomchip {
    position: absolute;
    right: 10px;
    top: 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.45);
    padding: 3px 7px;
    border-radius: 5px;
    pointer-events: none;
  }
  .mono { font-family: var(--font-mono); }
</style>
