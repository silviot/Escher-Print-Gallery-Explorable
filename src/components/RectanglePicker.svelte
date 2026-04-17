<script lang="ts">
  import type { Rect } from '../lib/math/droste';
  import { drosteGeometry } from '../lib/math/droste';
  import { selectionState, setRect } from '../lib/stores/selection.svelte';

  import type { Snippet } from 'svelte';
  type Props = { image: { width: number; height: number }; children?: Snippet };
  let { image, children }: Props = $props();

  let container: HTMLDivElement;

  type DragKind =
    | { type: 'body'; startRect: Rect; startPx: { x: number; y: number } }
    | {
        type: 'corner';
        corner: 0 | 1 | 2 | 3;
        opposite: { x: number; y: number };
        signX: -1 | 1;
        signY: -1 | 1;
      }
    | null;
  let drag: DragKind = $state(null);

  const aspect = $derived(image.width / image.height);

  const geom = $derived(
    selectionState.rect ? drosteGeometry(image, selectionState.rect) : null
  );

  const ghostRects = $derived.by(() => {
    const r = selectionState.rect;
    if (!r) return [] as { rect: Rect; opacity: number }[];
    const out: { rect: Rect; opacity: number }[] = [];
    // f(p) = topLeft + p/S — apply successively to the inner rect itself
    const S = image.width / r.w;
    let cur = r;
    for (let i = 0; i < 2; i++) {
      const next: Rect = {
        x: r.x + cur.x / S,
        y: r.y + cur.y / S,
        w: cur.w / S,
        h: cur.h / S
      };
      out.push({ rect: next, opacity: 0.35 / (i + 1) });
      cur = next;
    }
    return out;
  });

  function clientToImage(e: PointerEvent | MouseEvent) {
    const rect = container.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * image.width,
      y: ((e.clientY - rect.top) / rect.height) * image.height
    };
  }

  function onBodyPointerDown(e: PointerEvent) {
    if (!selectionState.rect) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = {
      type: 'body',
      startRect: { ...selectionState.rect },
      startPx: clientToImage(e)
    };
  }

  function onCornerPointerDown(e: PointerEvent, corner: 0 | 1 | 2 | 3) {
    if (!selectionState.rect) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = selectionState.rect;
    // opposite corner stays fixed
    const opposite = {
      x: corner === 0 || corner === 3 ? r.x + r.w : r.x,
      y: corner === 0 || corner === 1 ? r.y + r.h : r.y
    };
    const signX: -1 | 1 = corner === 0 || corner === 3 ? -1 : 1;
    const signY: -1 | 1 = corner === 0 || corner === 1 ? -1 : 1;
    drag = { type: 'corner', corner, opposite, signX, signY };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !selectionState.rect) return;
    const p = clientToImage(e);
    if (drag.type === 'body') {
      const dx = p.x - drag.startPx.x;
      const dy = p.y - drag.startPx.y;
      setRect(image, {
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
        w: drag.startRect.w,
        h: drag.startRect.h
      });
    } else {
      // aspect-locked uniform scale about opposite corner
      const dx = (p.x - drag.opposite.x) * drag.signX;
      const dy = (p.y - drag.opposite.y) * drag.signY;
      const w = Math.max(Math.abs(dx), Math.abs(dy) * aspect);
      const h = w / aspect;
      const x = drag.signX === 1 ? drag.opposite.x : drag.opposite.x - w;
      const y = drag.signY === 1 ? drag.opposite.y : drag.opposite.y - h;
      setRect(image, { x, y, w, h });
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (drag) {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {}
      drag = null;
    }
  }

  // Edge-arrow geometry for when c is outside the image.
  const limitOutside = $derived.by(() => {
    if (!geom) return null;
    const { x, y } = geom.limit;
    if (x >= 0 && x <= image.width && y >= 0 && y <= image.height) return null;
    const cx = Math.max(0, Math.min(image.width, x));
    const cy = Math.max(0, Math.min(image.height, y));
    return { edge: { x: cx, y: cy }, offset: { x: x - cx, y: y - cy } };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={container}
  class="picker"
  style="aspect-ratio: {image.width} / {image.height};"
  role="application"
  aria-label="Droste rectangle picker"
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  {@render children?.()}

  {#if selectionState.rect}
    {@const r = selectionState.rect}
    <svg
      class="overlay"
      viewBox="0 0 {image.width} {image.height}"
      preserveAspectRatio="none"
      role="application"
      aria-label="Droste rectangle picker"
    >
      <!-- dim outside region -->
      <defs>
        <mask id="hole">
          <rect x="0" y="0" width={image.width} height={image.height} fill="white" />
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="black" />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width={image.width}
        height={image.height}
        fill="rgba(16,24,32,0.35)"
        mask="url(#hole)"
        pointer-events="none"
      />

      <!-- ghost nesting rects -->
      {#each ghostRects as g}
        <rect
          x={g.rect.x}
          y={g.rect.y}
          width={g.rect.w}
          height={g.rect.h}
          fill="none"
          stroke="var(--teal)"
          stroke-width={1.2 / Math.max(1, image.width / 800)}
          vector-effect="non-scaling-stroke"
          opacity={g.opacity}
          pointer-events="none"
        />
      {/each}

      <!-- body (draggable) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect
        class="body"
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill="transparent"
        stroke="var(--teal)"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
        onpointerdown={onBodyPointerDown}
      />

      <!-- corner handles -->
      {#each [{ cx: r.x, cy: r.y, i: 0 }, { cx: r.x + r.w, cy: r.y, i: 1 }, { cx: r.x + r.w, cy: r.y + r.h, i: 2 }, { cx: r.x, cy: r.y + r.h, i: 3 }] as h}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="handle"
          onpointerdown={(e) => onCornerPointerDown(e, h.i as 0 | 1 | 2 | 3)}
          transform="translate({h.cx} {h.cy})"
        >
          <!-- invisible wide hitbox for touch -->
          <circle r={Math.max(image.width, image.height) * 0.025} fill="transparent" />
          <circle
            class="dot"
            r={Math.max(image.width, image.height) * 0.007}
            fill="var(--bg)"
            stroke="var(--teal)"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </g>
      {/each}

      <!-- limit point crosshair -->
      {#if geom}
        {@const inside = !limitOutside}
        {@const cx = inside ? geom.limit.x : limitOutside!.edge.x}
        {@const cy = inside ? geom.limit.y : limitOutside!.edge.y}
        {@const arm = Math.max(image.width, image.height) * 0.015}
        <g class="limit" transform="translate({cx} {cy})" pointer-events="none">
          <circle
            r={arm * 0.7}
            fill="none"
            stroke={inside ? 'var(--warm)' : 'var(--green)'}
            stroke-width="1.25"
            vector-effect="non-scaling-stroke"
          />
          <line
            x1={-arm}
            y1="0"
            x2={arm}
            y2="0"
            stroke={inside ? 'var(--warm)' : 'var(--green)'}
            stroke-width="1.25"
            vector-effect="non-scaling-stroke"
          />
          <line
            x1="0"
            y1={-arm}
            x2="0"
            y2={arm}
            stroke={inside ? 'var(--warm)' : 'var(--green)'}
            stroke-width="1.25"
            vector-effect="non-scaling-stroke"
          />
          {#if !inside}
            {@const L = Math.hypot(limitOutside!.offset.x, limitOutside!.offset.y)}
            {@const ux = limitOutside!.offset.x / L}
            {@const uy = limitOutside!.offset.y / L}
            {@const tipX = ux * arm * 2.5}
            {@const tipY = uy * arm * 2.5}
            <line
              x1="0"
              y1="0"
              x2={tipX}
              y2={tipY}
              stroke="var(--green)"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            <polygon
              points="{tipX},{tipY} {tipX - ux * arm - uy * arm * 0.5},{tipY - uy * arm + ux * arm * 0.5} {tipX - ux * arm + uy * arm * 0.5},{tipY - uy * arm - ux * arm * 0.5}"
              fill="var(--green)"
            />
          {/if}
        </g>
      {/if}
    </svg>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 100%;
    max-width: 960px;
    background: var(--bg);
    user-select: none;
    touch-action: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .overlay :global(.body),
  .overlay :global(.handle) {
    pointer-events: auto;
  }
  .overlay :global(.body) {
    cursor: grab;
    transition: stroke-width 120ms var(--ease);
  }
  .overlay :global(.body:active) {
    cursor: grabbing;
  }
  .overlay :global(.handle .dot) {
    transition: r 120ms var(--ease), stroke-width 120ms var(--ease);
  }
  .overlay :global(.handle:hover .dot) {
    stroke-width: 2;
  }
  .overlay :global(.handle) {
    cursor: nwse-resize;
  }
</style>
