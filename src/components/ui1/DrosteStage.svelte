<script lang="ts">
  /**
   * Regular Droste preview for /ui1.
   *
   * The "classic" Droste effect: the source image painted with a scaled
   * copy of itself inside the user-drawn rectangle, with another inside
   * that one, etc. — and a smooth, seamless camera zoom toward the
   * per-axis fixed point of that self-similar map.
   *
   * Separate from PreviewStage (the log-polar spiral). When the user is
   * on this view, the export pipeline picks up THIS stage's renderFrame
   * binding instead of the spiral's, so PNG / MP4 / share all reflect
   * what's on screen.
   *
   * Why 2D canvas instead of WebGL:
   *
   *  - Each frame is a handful of ctx.drawImage calls (one per visible
   *    nesting level — typically 10–20). The browser's 2D pipeline is
   *    well under a millisecond for this on any device the spiral
   *    renderer is also expected to work on.
   *  - No shader to compile, no texture upload to cache, no WebGL
   *    context-loss bookkeeping. Adding the GPU path here would buy us
   *    nothing visible and bloat the bundle.
   *
   * Math (per axis; we keep x/y independent to handle non-square rects):
   *
   *   sx = R.w / W                          # scale ratio of the rect
   *   fixed point cx = R.x / (1 - sx)       # solves x = R.x + sx * x
   *   at time t, effective t' is t (zoom-in) or 1 - t (zoom-out)
   *   camera scale     s = sx^t'
   *   camera centre    Cx = (1 - s)/(1 - sx) * R.x + s * (W/2)
   *                       (interpolates from image-centre at t'=0 to
   *                        rect-centre at t'=1 along the orbit of the
   *                        Droste similarity, so the loop is seamless)
   *   camera viewport  W * s wide, H * s' tall (s' = sy^t')
   *
   * Level n's image-shaped quad in image coords:
   *
   *   x_n = R.x * (1 - sx^n) / (1 - sx)
   *   w_n = W * sx^n
   *
   * We paint levels 0..N from outermost to innermost (later levels
   * naturally overpaint the previous ones inside R). N is picked per
   * frame so that the deepest painted level is still ≥ ~0.5 target px
   * — anything smaller would alias.
   */

  import { doc, playback } from '../../lib/ui1/state.svelte';
  import { buildDrosteFrameParams, workingCrop } from '../../lib/ui1/droste-frame';

  type Props = {
    bindRenderFrame?: (fn: (off: HTMLCanvasElement, t: number) => Promise<void>) => void;
  };
  let { bindRenderFrame }: Props = $props();

  let viewport: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let viewW = $state(0);
  let viewH = $state(0);

  const hasRect = $derived(doc.rect.w > 0 && doc.rect.h > 0);

  // sx, sy guard: a degenerate rect (full crop or larger) gives sx≥1
  // and the fixed-point formula blows up. The Droste math runs in the
  // crop's local coordinate space, matching the spiral renderer: the
  // crop is the working image and the nest is translated into it.
  const params = $derived.by(() => {
    if (!doc.image || !hasRect) return null;
    return buildDrosteFrameParams(doc.image, doc.rect, doc.crop);
  });

  const fit = $derived.by(() => {
    if (!doc.image || viewW <= 0 || viewH <= 0) return null;
    const crop = workingCrop(doc.image, doc.crop);
    const iw = crop.w;
    const ih = crop.h;
    const ia = iw / ih;
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

  // Live preview render. Sized to the letterboxed fit at devicePixelRatio
  // so the canvas's intrinsic pixels match what's on screen.
  $effect(() => {
    if (!canvas || !params || !fit || !doc.image) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(fit.w * dpr));
    const h = Math.max(1, Math.round(fit.h * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    void playback.t;
    void doc.shape;
    drawFrame(canvas, playback.t);
  });

  /**
   * Paint one frame of the Droste zoom onto `target` at progress t ∈ [0,1).
   * Honours playback.direction. Used both by the live preview ($effect
   * above) and by the export pipeline (exposed via bindRenderFrame).
   */
  function drawFrame(target: HTMLCanvasElement, t: number): void {
    if (!params || !doc.image) return;
    const { W, H, sx, sy, Rx, Ry, cropX, cropY, cropW, cropH } = params;
    const effT = playback.direction === 'in' ? t : 1 - t;
    const scaleX = Math.pow(sx, effT);
    const scaleY = Math.pow(sy, effT);
    const camCx = ((1 - scaleX) / (1 - sx)) * Rx + scaleX * (W / 2);
    const camCy = ((1 - scaleY) / (1 - sy)) * Ry + scaleY * (H / 2);
    const camW = W * scaleX;
    const camH = H * scaleY;
    const camX = camCx - camW / 2;
    const camY = camCy - camH / 2;

    const tw = target.width;
    const th = target.height;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Edge fill: when the rect isn't aspect-matched to the image the
    // camera viewport at t close to 1 may extend past the painted
    // levels along the off-axis. A flat dark fill reads cleaner than
    // whatever stale pixels happen to be in the buffer.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, tw, th);

    // image-coords → target-coords affine transform.
    const ax = tw / camW;
    const ay = th / camH;

    // Circular mode: clip to a STATIC vignette — the ellipse inscribed in the
    // (crop-aspect) canvas. Applied in canvas space, before the camera
    // transform, so the round outer frame and its black corners stay put while
    // the content zooms (no "breathing" as copies hand off). This is the outer
    // circle the user selected.
    const ellipseMode = doc.shape === 'ellipse';
    if (ellipseMode) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(tw / 2, th / 2, tw / 2, th / 2, 0, 0, Math.PI * 2);
      ctx.clip();
    }

    ctx.setTransform(ax, 0, 0, ay, -camX * ax, -camY * ay);

    // Stop painting when the next level would be sub-pixel on the
    // target canvas. Level n's painted width on target is
    //   W * sx^n * ax = tw * sx^(n - effT)
    // We want that ≥ ~0.5 px:
    //   n ≤ effT + log(0.5/tw)/log(sx)
    // With sx<1 the log is negative, so dividing flips the inequality.
    const minWidthPx = 0.5;
    const nMaxFromSx = Math.floor(effT + Math.log(minWidthPx / tw) / Math.log(sx));
    const nMaxFromSy = Math.floor(effT + Math.log(minWidthPx / th) / Math.log(sy));
    // Pick the looser of the two (we want to keep painting until BOTH
    // dimensions are sub-pixel), then cap at a sane absolute limit.
    const nMax = Math.min(Math.max(nMaxFromSx, nMaxFromSy) + 1, 60);

    if (ellipseMode) {
      // Circular Droste. Every copy is a *window*: the ellipse inscribed in
      // its own frame (the circular nesting). Inside the static vignette the
      // zoom must be seamless, so the interior has to stay filled edge-to-edge
      // with no gaps — otherwise the loop breathes. We therefore paint from
      // the outermost copy that still COVERS the frame (it fills the vignette
      // interior) inward to sub-pixel, each clipped to its own ellipse.
      // Painting outer → inner, the innermost copy containing a pixel wins —
      // the nested-window look. The vignette clip keeps the corners black.
      // (Replaces the old level-0-as-unclipped-rectangle path — the "outer
      // rectangle that flipped to a circle".)
      const levelRect = (n: number) => {
        const pw = Math.pow(sx, n);
        const ph = Math.pow(sy, n);
        return {
          x: (Rx * (1 - pw)) / (1 - sx),
          y: (Ry * (1 - ph)) / (1 - sy),
          w: W * pw,
          h: H * ph
        };
      };
      const corners: Array<[number, number]> = [
        [camX, camY], [camX + camW, camY],
        [camX, camY + camH], [camX + camW, camY + camH]
      ];
      // Does level n's ellipse cover the whole viewport (→ fills the vignette)?
      const covers = (r: { x: number; y: number; w: number; h: number }): boolean => {
        const ex = r.x + r.w / 2, ey = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
        return corners.every(([px, py]) => {
          const dx = (px - ex) / rx, dy = (py - ey) / ry;
          return dx * dx + dy * dy <= 1;
        });
      };
      // Outermost copy to paint: the first one (walking outward) whose ellipse
      // covers the viewport, so the vignette interior is always fully filled.
      // Floor-capped for extreme off-centre nests (whose corners then stay
      // black — inherent to a round frame).
      const OUTER_FLOOR = -48;
      let nLo = 0;
      while (nLo > OUTER_FLOOR && !covers(levelRect(nLo))) nLo--;
      for (let n = nLo; n <= nMax; n++) {
        const r = levelRect(n);
        // Off-screen levels contribute nothing (cheap bbox reject).
        if (r.x + r.w < camX || r.x > camX + camW || r.y + r.h < camY || r.y > camY + camH) {
          continue;
        }
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(doc.image, cropX, cropY, cropW, cropH, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    } else {
      // Rectangular Droste (fast path): level 0 is the full image and fills
      // the frame, so only inward levels are needed. Power-table avoids a
      // Math.pow per iteration.
      let pxw = 1; // sx^n
      let pyw = 1; // sy^n
      // Accumulated geometric sums for the position formulas:
      //   x_n = Rx * (1 - sx^n) / (1 - sx) = Rx * sum_{k=0..n-1} sx^k
      let xn = 0;
      let yn = 0;
      for (let n = 0; n <= nMax; n++) {
        const rw = W * pxw;
        const rh = H * pyw;
        // Skip levels that fall entirely outside the camera viewport.
        if (xn + rw >= camX && xn <= camX + camW && yn + rh >= camY && yn <= camY + camH) {
          ctx.drawImage(doc.image, cropX, cropY, cropW, cropH, xn, yn, rw, rh);
        }
        xn += Rx * pxw;
        yn += Ry * pyw;
        pxw *= sx;
        pyw *= sy;
      }
    }

    if (ellipseMode) ctx.restore(); // release the static vignette clip
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  async function renderFrameToOffscreen(off: HTMLCanvasElement, t: number): Promise<void> {
    drawFrame(off, t);
  }

  $effect(() => {
    bindRenderFrame?.(renderFrameToOffscreen);
  });
</script>

<section class="droste">
  <div class="viewport" bind:this={viewport}>
    {#if doc.image && params}
      <canvas
        bind:this={canvas}
        style:left="{fit?.offX ?? 0}px"
        style:top="{fit?.offY ?? 0}px"
        style:width="{fit?.w ?? 0}px"
        style:height="{fit?.h ?? 0}px"
      ></canvas>
    {:else if !doc.image}
      <div class="hint mono">Load an image first.</div>
    {:else}
      <div class="hint mono">Draw a rectangle to see the Droste effect.</div>
    {/if}
  </div>
</section>

<style>
  .droste {
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
    background: #000;
  }
  canvas {
    position: absolute;
    display: block;
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
