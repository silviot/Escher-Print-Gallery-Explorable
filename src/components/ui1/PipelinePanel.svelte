<script lang="ts">
  /**
   * One derived panel of the 4-panel pipeline explorable: the log,
   * rotated-log, or tententoon-still view of the current selection.
   *
   * The top-left panel of the grid is the rectangle editor (CanvasStage,
   * reused as-is); this component covers the other three. Geometry comes
   * from the shared doc.rect / doc.crop.
   *
   * Rendering goes through the GPU (PipelinePanelGLRenderer) when WebGL2 is
   * available — one shader, mipmap-sampled, orders of magnitude faster than
   * the per-pixel CPU loop. The CPU functions in lib/ui1/pipeline-panels.ts
   * are the fallback (and the tested reference for the same maps).
   *
   * Layout: log / rotated-log FILL the cell with the infinitely-repeating
   * lattice (no letterbox, no black). The tententoon still is letterboxed
   * to the crop aspect, since its output lives in working-image space.
   *
   * All work is rAF-coalesced and gated on ui.view === 'pipeline', so the
   * panels are inert whenever they're hidden by CSS.
   */

  import { doc, ui } from '../../lib/ui1/state.svelte';
  import { pixelsFor } from '../../lib/ui1/pixels-cache';
  import { detectCapabilities } from '../../lib/render/capabilities';
  import { PipelinePanelGLRenderer } from '../../lib/render/pipeline-gl';
  import {
    buildPanelGeometry,
    renderLogPanel,
    renderRotatedLogPanel,
    renderEscherStill,
    panelPxPerUnit,
    panelURef,
    MIN_LOGS,
    LOG_V_PERIODS,
    ROT_V_PERIODS,
    type PanelImage
  } from '../../lib/ui1/pipeline-panels';
  import { experiment } from '../../lib/ui1/pipeline-experiments.svelte';

  type Kind = 'log' | 'rotlog' | 'escher';
  let { kind }: { kind: Kind } = $props();

  // Decide the backend once. WebGL2 (non-software) → GPU; else CPU 2d. A
  // canvas can only ever hand out one context type, so this must be fixed
  // before we touch the canvas.
  const useGL = detectCapabilities().webgl2;

  // Cap the rasterised long side: keeps the GPU framebuffer (and the CPU
  // fallback loop) bounded; a still doesn't need device-native density.
  const MAX_PX = 900;

  const TITLES: Record<Kind, string> = {
    log: 'log(z − c)',
    rotlog: 'rotated log',
    escher: 'tententoon'
  };

  let viewport: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let viewW = $state(0);
  let viewH = $state(0);
  let glRenderer = $state<PipelinePanelGLRenderer | null>(null);

  const active = $derived(ui.view === 'pipeline');
  const hasRect = $derived(doc.rect.w > 0 && doc.rect.h > 0);

  const geom = $derived.by(() => {
    if (!active || !doc.image || !hasRect || !doc.crop) return null;
    return buildPanelGeometry(doc.rect, doc.crop, doc.shape);
  });

  // Nest nearly fills its frame (S ≈ 1): no Droste structure to show, and the
  // fold would divide by ~0. Surface a hint instead of rendering black.
  const degenerate = $derived(!!geom && geom.ctx.logS < MIN_LOGS);

  // Active rotation/twist angle: the experiment override, else canonical β.
  const gammaRad = $derived.by(() => {
    if (!geom) return 0;
    if (experiment.angleDeg !== null) return (experiment.angleDeg * Math.PI) / 180;
    return Math.atan2(geom.ctx.logS, 2 * Math.PI);
  });

  // Letterboxed CSS footprint. Escher preserves the crop aspect; the log
  // panels fill the whole cell (the lattice tiles infinitely).
  const fit = $derived.by(() => {
    if (!geom || viewW <= 0 || viewH <= 0) return null;
    if (kind !== 'escher') return { w: viewW, h: viewH, offX: 0, offY: 0 };
    const a = geom.ctx.W / geom.ctx.H;
    const va = viewW / viewH;
    let w: number;
    let h: number;
    if (va > a) { h = viewH; w = h * a; } else { w = viewW; h = w / a; }
    return { w, h, offX: (viewW - w) / 2, offY: (viewH - h) / 2 };
  });

  const chips = $derived.by(() => {
    if (!geom) return [];
    const logS = geom.ctx.logS;
    if (kind === 'log') return [`logS = ${logS.toFixed(3)}`, 'period_v = 2π'];
    if (kind === 'rotlog') {
      const deg = (gammaRad * 180) / Math.PI;
      const tag = experiment.angleDeg !== null ? ' (set)' : '';
      const L = Math.hypot(logS, 2 * Math.PI);
      return [`β = ${deg.toFixed(1)}°${tag}`, `L = ${L.toFixed(2)}`];
    }
    return [`S = ${geom.S.toFixed(2)}`];
  });

  // Coordinate-axis overlay for the two log panels (escher is the spiral —
  // no cartesian axes). All in CSS px of the (cell-filling) canvas, so it's
  // dpr-independent and stays aligned with the rendered lattice. The origin
  // (uRef, v=0) sits at the panel centre; u increases right, v increases
  // down — matching the render's pixel→(u,v) mapping.
  const TWO_PI = 2 * Math.PI;
  const axes = $derived.by(() => {
    if (kind === 'escher' || !geom || !fit || degenerate) return null;
    const W = fit.w;
    const H = fit.h;
    const cx = W / 2;
    const cy = H / 2;
    const logS = geom.ctx.logS;
    if (kind === 'log') {
      // One vertical lattice line per Droste period (constant-radius rings).
      const cssPerUnit = H / (LOG_V_PERIODS * TWO_PI);
      const stepX = logS * cssPerUnit;
      const gridX: number[] = [];
      if (stepX >= 10) {
        for (let x = cx; x <= W + 0.5; x += stepX) gridX.push(x);
        for (let x = cx - stepX; x >= -0.5; x -= stepX) gridX.push(x);
      }
      return {
        kind, W, H, cx, cy, stepX, gridX,
        xLabel: 'u = log |z − c|', yLabel: 'v = arg(z − c)'
      };
    }
    // rotated log: show the panel's own u′/v′ axes, plus the original log
    // u-axis (v = 0) which lands at v′ = u′·tan γ — a line tilted by the
    // active rotation γ. That tilt is the whole point of the panel.
    const beta = gammaRad;
    const len = Math.min(W, H) * 0.42;
    const c = Math.cos(beta);
    const s = Math.sin(beta);
    return {
      kind, W, H, cx, cy,
      xLabel: 'u′', yLabel: 'v′',
      origX1: cx - c * len, origY1: cy - s * len,
      origX2: cx + c * len, origY2: cy + s * len,
      origLabelX: cx + c * len * 0.82, origLabelY: cy + s * len * 0.82 + 13
    };
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

  // Bring up the GPU renderer once the canvas exists (GL backend only).
  $effect(() => {
    if (!canvas || !useGL) {
      glRenderer?.dispose();
      glRenderer = null;
      return;
    }
    let r: PipelinePanelGLRenderer | null = null;
    try {
      r = new PipelinePanelGLRenderer();
      r.init(canvas);
      glRenderer = r;
    } catch {
      // WebGL2 reported available but init failed; leave the panel blank
      // rather than corrupting the canvas with a half-built context.
      r?.dispose();
      glRenderer = null;
    }
    return () => {
      r?.dispose();
      glRenderer = null;
    };
  });

  function paintCpu(target: PanelImage): void {
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    if (canvas.width !== target.width) canvas.width = target.width;
    if (canvas.height !== target.height) canvas.height = target.height;
    const img = ctx2d.createImageData(target.width, target.height);
    img.data.set(target.data);
    ctx2d.putImageData(img, 0, 0);
  }

  // rAF-coalesced render: re-runs on any reactive input, draws once/frame.
  $effect(() => {
    if (!canvas || !geom || !fit || !doc.image || degenerate) return;
    if (useGL && !glRenderer) return;
    const g = geom;
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
    // Read every reactive input SYNCHRONOUSLY here so the effect re-runs when
    // it changes. Values read only inside the rAF callback below are NOT
    // tracked by Svelte — that's why angle/pan changes used to repaint the
    // axes (a $derived) but never the canvas.
    const rot = gammaRad;
    const kTwist = Math.tan(gammaRad);
    const panU = experiment.panU;
    const panV = experiment.panV;

    const raf = requestAnimationFrame(() => {
      const ppu = kind === 'escher' ? 0 : panelPxPerUnit(kind, g.ctx.logS, ch);
      const uRef = panelURef(g.ctx.rMax);
      const scale = cw / g.ctx.W; // escher: == ch / g.ctx.H (crop-letterboxed)
      const lnR0 = Math.log(Math.max(g.R0, 1e-9));

      if (useGL && glRenderer) {
        glRenderer.render({
          pixels, ctx: g.ctx, mode: kind, W: cw, H: ch,
          pxPerUnit: ppu, uRef, scale, lnR0,
          rot, kTwist, panU, panV
        });
        return;
      }
      const opts = { panU, panV, rot, kTwist };
      let out: PanelImage;
      if (kind === 'log') out = renderLogPanel(pixels, g.ctx, ppu, uRef, cw, ch, opts);
      else if (kind === 'rotlog') out = renderRotatedLogPanel(pixels, g.ctx, ppu, uRef, cw, ch, opts);
      else out = renderEscherStill(pixels, g.ctx, g.R0, scale, cw, ch, opts);
      paintCpu(out);
    });
    return () => cancelAnimationFrame(raf);
  });

  // --- Experiment: drag the rotated-log panel to pan (idea 2). The drag
  // delta in the rotated (u′, v′) frame becomes a log-space pan δ = R(−γ)·d,
  // written to the shared experiment state — so the same shift scrolls the
  // log panels AND zooms (u) / rotates (v) the tententoon.
  let dragStart: { x: number; y: number; panU: number; panV: number } | null = null;
  const canPan = $derived(kind === 'rotlog' && !!geom && !degenerate);

  function onPanDown(e: PointerEvent) {
    if (!canPan) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY, panU: experiment.panU, panV: experiment.panV };
  }
  function onPanMove(e: PointerEvent) {
    if (!dragStart || !geom || !fit) return;
    const L = Math.hypot(geom.ctx.logS, 2 * Math.PI);
    const cssPerUnit = fit.h / (ROT_V_PERIODS * L);
    // Screen delta → rotated-frame units. Negate so content follows the cursor.
    const du = -(e.clientX - dragStart.x) / cssPerUnit;
    const dv = -(e.clientY - dragStart.y) / cssPerUnit;
    const c = Math.cos(gammaRad);
    const s = Math.sin(gammaRad);
    experiment.panU = dragStart.panU + (du * c + dv * s);
    experiment.panV = dragStart.panV + (-du * s + dv * c);
  }
  function onPanUp() {
    dragStart = null;
  }
</script>

<section class="ppanel" class:pannable={canPan}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    bind:this={viewport}
    onpointerdown={canPan ? onPanDown : undefined}
    onpointermove={canPan ? onPanMove : undefined}
    onpointerup={canPan ? onPanUp : undefined}
    onpointercancel={canPan ? onPanUp : undefined}
  >
    {#if doc.image && geom && fit && !degenerate}
      <canvas
        bind:this={canvas}
        style:left="{fit.offX}px"
        style:top="{fit.offY}px"
        style:width="{fit.w}px"
        style:height="{fit.h}px"
      ></canvas>
      {#if axes}
        <svg
          class="axes"
          viewBox="0 0 {axes.W} {axes.H}"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker id="pp-arrow-{kind}" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" class="arrowhead" />
            </marker>
          </defs>
          {#if axes.kind === 'log'}
            {#each axes.gridX as gx}
              <line x1={gx} y1="0" x2={gx} y2={axes.H} class="grid" />
            {/each}
          {:else}
            <line
              x1={axes.origX1} y1={axes.origY1} x2={axes.origX2} y2={axes.origY2}
              class="orig"
            />
            <text x={axes.origLabelX} y={axes.origLabelY} class="axtext small orig-label">u-axis (β)</text>
          {/if}
          <!-- X axis: u increases right -->
          <line x1="0" y1={axes.cy} x2={axes.W} y2={axes.cy} class="axis" marker-end="url(#pp-arrow-{kind})" />
          <!-- Y axis: v increases down -->
          <line x1={axes.cx} y1="0" x2={axes.cx} y2={axes.H} class="axis" marker-end="url(#pp-arrow-{kind})" />
          <text x={axes.W - 9} y={axes.cy - 7} text-anchor="end" class="axtext">{axes.xLabel}</text>
          <text x={axes.cx + 8} y={axes.H - 9} class="axtext">{axes.yLabel}</text>
          {#if axes.kind === 'log'}
            <line x1={axes.cx} y1={axes.cy + 10} x2={axes.cx + axes.stepX} y2={axes.cy + 10} class="period" />
            <line x1={axes.cx} y1={axes.cy + 6} x2={axes.cx} y2={axes.cy + 14} class="period" />
            <line x1={axes.cx + axes.stepX} y1={axes.cy + 6} x2={axes.cx + axes.stepX} y2={axes.cy + 14} class="period" />
            <text x={axes.cx + axes.stepX / 2} y={axes.cy + 24} text-anchor="middle" class="axtext small">logS</text>
          {/if}
        </svg>
      {/if}
      <div class="label mono">
        <span class="title">{TITLES[kind]}</span>
        {#each chips as chip}<span class="chip">{chip}</span>{/each}
      </div>
    {:else if !doc.image}
      <div class="hint mono">Load an image first.</div>
    {:else if degenerate}
      <div class="hint mono">Shrink the rectangle — it nearly fills the frame, so there's no spiral yet.</div>
    {:else}
      <div class="hint mono">Draw a rectangle to see {TITLES[kind]}.</div>
    {/if}
  </div>
</section>

<style>
  .ppanel {
    min-width: 0;
    min-height: 0;
    background: var(--canvas-bg);
    position: relative;
    overflow: hidden;
    display: flex;
    border-left: 1px solid var(--border);
    border-top: 1px solid var(--border);
  }
  .viewport {
    position: absolute;
    inset: 6px;
    border-radius: 4px;
    overflow: hidden;
    background: #000;
  }
  .pannable .viewport { cursor: grab; touch-action: none; }
  .pannable .viewport:active { cursor: grabbing; }
  canvas {
    position: absolute;
    display: block;
    image-rendering: auto;
  }
  .axes {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    /* Dark halo so the amber axes read over any image region. */
    filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.95));
  }
  .axes .axis { stroke: rgba(255, 209, 138, 0.98); stroke-width: 2; }
  .axes .grid { stroke: rgba(255, 209, 138, 0.32); stroke-width: 1; }
  .axes .period { stroke: rgba(255, 209, 138, 0.98); stroke-width: 1.6; }
  .axes .orig {
    stroke: rgba(150, 205, 255, 0.85);
    stroke-width: 1.4;
    stroke-dasharray: 5 4;
  }
  .axes .arrowhead { fill: rgba(255, 217, 160, 0.95); }
  .axes .axtext {
    fill: #fff;
    font-family: var(--font-mono);
    font-size: 11px;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.7);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .axes .axtext.small { font-size: 10px; }
  .axes .orig-label { fill: rgba(190, 224, 255, 0.95); }
  .label {
    position: absolute;
    left: 8px;
    top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    pointer-events: none;
  }
  .label .title {
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .label .chip {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.45);
    padding: 2px 5px;
    border-radius: 4px;
  }
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
    text-align: center;
    padding: 0 16px;
  }
</style>
