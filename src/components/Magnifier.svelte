<script lang="ts">
  import { imageState } from '../lib/stores/image.svelte';
  import { selectionState, setRect } from '../lib/stores/selection.svelte';
  import { interactionState } from '../lib/stores/interaction.svelte';
  import type { Rect } from '../lib/math/droste';

  const SIZE = 220; // CSS pixels, square
  const HIT_CSS = 14; // handle hit radius in CSS pixels

  let canvas: HTMLCanvasElement | null = $state(null);
  let zoomOverride: number | null = $state(null);

  type LoupeDrag =
    | {
        type: 'body';
        startRect: Rect;
        startImg: { x: number; y: number };
        focusSnap: { x: number; y: number };
        zoomSnap: number;
      }
    | {
        type: 'corner';
        opposite: { x: number; y: number };
        signX: -1 | 1;
        signY: -1 | 1;
        focusSnap: { x: number; y: number };
        zoomSnap: number;
      }
    | null;
  let drag: LoupeDrag = $state(null);

  // Baseline zoom that grows gently with S so the loupe reveals detail at
  // extreme placement without pixel-stretching at modest S.
  const autoZoom = $derived.by(() => {
    const r = selectionState.rect;
    const src = imageState.source;
    if (!r || !src) return 1.5;
    const S = src.width / r.w;
    return Math.max(1.2, Math.min(6, S * 0.3));
  });

  const zoom = $derived(zoomOverride ?? autoZoom);

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

  // CSS-coord → image-coord based on a focus/zoom snapshot (frozen during drag
  // so the coord math can't feed back on itself as we pan the loupe centre).
  function cssToImage(cssX: number, cssY: number, f: { x: number; y: number }, z: number) {
    return {
      x: f.x + (cssX - SIZE / 2) / z,
      y: f.y + (cssY - SIZE / 2) / z
    };
  }

  function eventCss(e: PointerEvent) {
    const r = canvas!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (!imageState.source || !selectionState.rect || !focus) return;
    const f = focus;
    const z = zoom;
    const cs = eventCss(e);
    const img = cssToImage(cs.x, cs.y, f, z);
    const r = selectionState.rect;

    // Corner hit-test in CSS distance.
    const corners: { x: number; y: number; i: 0 | 1 | 2 | 3 }[] = [
      { x: r.x, y: r.y, i: 0 },
      { x: r.x + r.w, y: r.y, i: 1 },
      { x: r.x + r.w, y: r.y + r.h, i: 2 },
      { x: r.x, y: r.y + r.h, i: 3 }
    ];
    let hit: { i: 0 | 1 | 2 | 3 } | null = null;
    let bestD = HIT_CSS;
    for (const c of corners) {
      const dx = (c.x - f.x) * z + SIZE / 2 - cs.x;
      const dy = (c.y - f.y) * z + SIZE / 2 - cs.y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        hit = { i: c.i };
      }
    }

    canvas!.setPointerCapture(e.pointerId);
    interactionState.active = true;

    if (hit) {
      const corner = hit.i;
      const opposite = {
        x: corner === 0 || corner === 3 ? r.x + r.w : r.x,
        y: corner === 0 || corner === 1 ? r.y + r.h : r.y
      };
      const signX: -1 | 1 = corner === 0 || corner === 3 ? -1 : 1;
      const signY: -1 | 1 = corner === 0 || corner === 1 ? -1 : 1;
      drag = { type: 'corner', opposite, signX, signY, focusSnap: f, zoomSnap: z };
    } else if (
      img.x >= r.x &&
      img.x <= r.x + r.w &&
      img.y >= r.y &&
      img.y <= r.y + r.h
    ) {
      drag = {
        type: 'body',
        startRect: { ...r },
        startImg: img,
        focusSnap: f,
        zoomSnap: z
      };
    } else {
      // empty click: no drag, keep the magnifier centred on the nest
      drag = null;
    }
  }

  function onPointerMoveCanvas(e: PointerEvent) {
    if (!imageState.source || !selectionState.rect) return;
    const src = imageState.source;
    if (!drag) return; // passive hover must NOT pan the magnifier away from the nest
    const cs = eventCss(e);
    const img = cssToImage(cs.x, cs.y, drag.focusSnap, drag.zoomSnap);

    if (drag.type === 'body') {
      const dx = img.x - drag.startImg.x;
      const dy = img.y - drag.startImg.y;
      setRect(
        { width: src.width, height: src.height },
        {
          x: drag.startRect.x + dx,
          y: drag.startRect.y + dy,
          w: drag.startRect.w,
          h: drag.startRect.h
        }
      );
    } else {
      const aspect = src.width / src.height;
      const dx = (img.x - drag.opposite.x) * drag.signX;
      const dy = (img.y - drag.opposite.y) * drag.signY;
      const w = Math.max(Math.abs(dx), Math.abs(dy) * aspect);
      const h = w / aspect;
      const x = drag.signX === 1 ? drag.opposite.x : drag.opposite.x - w;
      const y = drag.signY === 1 ? drag.opposite.y : drag.opposite.y - h;
      setRect({ width: src.width, height: src.height }, { x, y, w, h });
      // pan the loupe to keep the moving corner at centre
      interactionState.focus = {
        x: drag.signX === 1 ? x + w : x,
        y: drag.signY === 1 ? y + h : y
      };
      return;
    }
    interactionState.focus = img;
  }

  function onPointerUpCanvas(e: PointerEvent) {
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    }
    drag = null;
    interactionState.active = false;
  }

  function onPointerLeaveCanvas() {
    if (!interactionState.active) interactionState.focus = null;
  }
</script>

<aside class="magnifier">
  <header>
    <h3>Magnifier</h3>
    <span class="mono zoom">×{zoom.toFixed(1)}</span>
  </header>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <canvas
    bind:this={canvas}
    width={SIZE}
    height={SIZE}
    style="width: {SIZE}px; height: {SIZE}px;"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMoveCanvas}
    onpointerup={onPointerUpCanvas}
    onpointercancel={onPointerUpCanvas}
    onpointerleave={onPointerLeaveCanvas}
  ></canvas>
  <div class="controls mono">
    <input
      type="range"
      min="1"
      max="20"
      step="0.1"
      value={zoom}
      oninput={(e) => (zoomOverride = parseFloat((e.currentTarget as HTMLInputElement).value))}
      aria-label="Magnifier zoom"
    />
    <button
      class="reset"
      disabled={zoomOverride === null}
      onclick={() => (zoomOverride = null)}
      title="Match to S"
    >auto</button>
  </div>
  <p class="muted hint">Drag a handle or the nest here too — CSS-pixel precision even at extreme S.</p>
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
    touch-action: none;
    cursor: crosshair;
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
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 220px;
  }
  .controls input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .reset {
    font-size: 0.7rem;
    padding: 0.15em 0.5em;
  }
  .reset:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
