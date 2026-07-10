<script lang="ts">
  /**
   * Editing stage for /ui1: image + rect overlay. Two layers inside a
   * fit-to-container viewport:
   *
   *   1. <imageCanvas>  2D-context. Shows the loaded source image.
   *   2. <svg>          Dim mask + rect outline + 8 handles + thirds grid +
   *                     dimension badge. Pure visual; the container owns
   *                     pointer events.
   *
   * The spiral output lives in PreviewStage (a separate pane). That way
   * dragging the rect doesn't repaint the same area the user is trying to
   * grab — you see the live result side by side instead.
   *
   * Pointer behaviour by tool:
   *   ui.tool === 'rect'   — marquee-drag on empty creates a rect; drag
   *                          inside the rect moves it; drag on a handle
   *                          resizes. Shift locks aspect to the active
   *                          chip; Alt resizes from centre.
   *   ui.tool === 'select' — drag the rect body / handles only.
   *   ui.tool === 'pan'    — drag pans the view at any zoom.
   *
   * Zoom + pan:
   *   - Mouse wheel zooms around the cursor.
   *   - Pinch (two pointers) zooms around the midpoint and pans together.
   *   - Middle-mouse drag pans regardless of tool.
   *   - Tool rail zoom buttons trigger ui.zoom changes; an effect rescales
   *     the local pan so the viewport centre stays put.
   *   Rect coordinates stay in image px throughout; we just compose a
   *   single CSS-px ↔ image-px transform that includes zoom and pan.
   */

  import {
    doc,
    ui,
    shapeAnim,
    commitNewRect,
    commitTranslate,
    commitResize,
    commitCropTranslate,
    type Rect
  } from '../../lib/ui1/state.svelte';
  import { shapeBoundary, pathD } from '../../lib/ui1/shape';
  import { snapRectToAspect, phase } from '../../lib/ui1/render';
  import { markGestureEnd } from '../../lib/ui1/tententoon.svelte';

  const MAX_ZOOM = 8;
  const MIN_ZOOM = 1;

  function clampZoom(z: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }

  let viewport: HTMLDivElement | null = $state(null);
  let imageCanvas: HTMLCanvasElement | null = $state(null);
  let viewW = $state(0);
  let viewH = $state(0);

  // Zoom + pan are LOCAL state, not in the cross-module `ui` rune. The
  // diagnostic indicator showed that writes to ui.zoom from this component
  // didn't propagate to template reads in UiVariant1 — the .svelte.ts
  // module appears to be getting separate proxy instances per importer
  // under this Vite/svelte-plugin setup. Local state in a single component
  // sidesteps the whole problem.
  let zoom = $state(1);
  let pan = $state({ x: 0, y: 0 });

  /** Fit at zoom = 1 — image letterboxed inside the viewport. */
  const fit = $derived.by(() => {
    if (!doc.image || viewW <= 0 || viewH <= 0) return null;
    const ia = doc.image.width / doc.image.height;
    const va = viewW / viewH;
    let w: number, h: number;
    if (va > ia) { h = viewH; w = h * ia; } else { w = viewW; h = w / ia; }
    return {
      w,
      h,
      scaleCss: w / doc.image.width
    };
  });

  /** Effective placement after zoom + pan. Used for everything visible. */
  const dispFit = $derived.by(() => {
    if (!fit) return null;
    const z = zoom;
    const w = fit.w * z;
    const h = fit.h * z;
    return {
      w,
      h,
      cssX0: viewW / 2 + pan.x - w / 2,
      cssY0: viewH / 2 + pan.y - h / 2,
      scale: fit.scaleCss * z,
      zoom: z
    };
  });

  const hasRect = $derived(doc.rect.w > 0 && doc.rect.h > 0);
  const ready = $derived(phase() !== 'empty');

  function clampPan(p: { x: number; y: number }): { x: number; y: number } {
    if (!fit) return { x: 0, y: 0 };
    const z = zoom;
    const extraX = Math.max(0, fit.w * z - viewW);
    const extraY = Math.max(0, fit.h * z - viewH);
    return {
      x: Math.max(-extraX / 2, Math.min(extraX / 2, p.x)),
      y: Math.max(-extraY / 2, Math.min(extraY / 2, p.y))
    };
  }

  // Reset pan/zoom when a new image is loaded.
  $effect(() => {
    void doc.image;
    pan = { x: 0, y: 0 };
    zoom = 1;
  });

  // Re-clamp pan when the viewport changes size (window resize, etc.).
  $effect(() => {
    void viewW; void viewH; void fit;
    const c = clampPan(pan);
    if (c.x !== pan.x || c.y !== pan.y) pan = c;
  });

  /**
   * Zoom to `newZ`, keeping the image point currently under (cssX, cssY)
   * pinned to that screen location. Atomic: pan and ui.zoom update
   * together so dispFit re-derives once with consistent values.
   * Single source of truth for every zoom change in the editor.
   */
  function applyZoomAt(newZ: number, cssX: number, cssY: number): void {
    if (!fit || !dispFit) return;
    const z = clampZoom(newZ);
    const imgX = (cssX - dispFit.cssX0) / dispFit.scale;
    const imgY = (cssY - dispFit.cssY0) / dispFit.scale;
    const newPanX = cssX - viewW / 2 + (fit.w * z) / 2 - imgX * fit.scaleCss * z;
    const newPanY = cssY - viewH / 2 + (fit.h * z) / 2 - imgY * fit.scaleCss * z;
    zoom = z;
    pan = z <= 1 ? { x: 0, y: 0 } : clampPan({ x: newPanX, y: newPanY });
  }


  // Wheel zoom (desktop). Attached via the onwheel attribute in the markup.
  function onWheel(e: WheelEvent): void {
    if (!doc.image || !viewport) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const cssX = e.clientX - r.left;
    const cssY = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0025);
    applyZoomAt(zoom * factor, cssX, cssY);
  }

  // 1. Track viewport size.
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

  // 2. Image-canvas: draw at the image's NATIVE pixel resolution once per
  //    image load. CSS then scales the canvas to dispFit.{w,h}, which means
  //    zooming in stays crisp down to one source pixel per CSS pixel and
  //    only blurs (browser bilinear) past native resolution. Avoids
  //    re-drawing the image on every zoom step.
  $effect(() => {
    if (!imageCanvas || !doc.image) return;
    imageCanvas.width = doc.image.width;
    imageCanvas.height = doc.image.height;
    const ctx = imageCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(doc.image, 0, 0);
  });

  // ---- pointer interaction ----

  type DragKind =
    | { kind: 'marquee'; startImg: { x: number; y: number } }
    | { kind: 'body'; startRect: Rect; startImg: { x: number; y: number } }
    | { kind: 'crop-body'; startCrop: Rect; startImg: { x: number; y: number } }
    | {
        kind: 'handle';
        name: string;
        startRect: Rect;
        opposite: { x: number; y: number };
        signX: -1 | 1;
        signY: -1 | 1;
        centerStart: { x: number; y: number } | null;
      }
    | { kind: 'pan'; startCss: { x: number; y: number }; startPan: { x: number; y: number } };
  let drag: DragKind | null = null;

  // ---- pinch / multi-touch ----
  // Active pointers (by pointerId). Single pointer → existing drag logic.
  // Two pointers → pinch (zoom + pan together). Third+ ignored.
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinch: {
    startDist: number;
    startZoom: number;
    midImg: { x: number; y: number };
  } | null = null;
  let dragMods = $state({ shift: false, alt: false });
  // Cursor follows hover state when not dragging: resize cursors over the
  // 8 handles, `move` over the rect body, crosshair (rect tool) or
  // default (other tools) elsewhere. During a drag we leave the cursor
  // alone so the gesture's affordance is stable.
  let cursor = $state('default');

  function handleCursor(name: string): string {
    if (name === 'nw' || name === 'se') return 'nwse-resize';
    if (name === 'ne' || name === 'sw') return 'nesw-resize';
    if (name === 'n' || name === 's') return 'ns-resize';
    if (name === 'e' || name === 'w') return 'ew-resize';
    return 'default';
  }

  function updateCursor(e: PointerEvent) {
    if (drag) {
      if (drag.kind === 'pan') cursor = 'grabbing';
      return;
    }
    if (!ready || !viewport) { cursor = 'default'; return; }
    const r = viewport.getBoundingClientRect();
    const cssX = e.clientX - r.left;
    const cssY = e.clientY - r.top;
    const h = hitHandle(cssX, cssY);
    if (h) { cursor = handleCursor(h); return; }
    const img = eventToImage(e);
    if (img && hasRect && inRect(img)) { cursor = 'move'; return; }
    // When zoomed in with a rect committed, dragging anywhere outside
    // the nest pans the view — show the same grab cursor everywhere so
    // the affordance reads as "this is now the pan zone".
    if (hasRect && zoom > 1) { cursor = 'grab'; return; }
    // In the crop margin (inside the working frame, outside the nest):
    // signal "grab" so the user knows they can drag the crop. Skip the
    // hint when the crop already fills the image on both axes — there's
    // nowhere to slide it.
    if (img && hasRect && inCrop(img) && cropMovable()) { cursor = 'grab'; return; }
    if (ui.tool === 'pan') { cursor = 'grab'; return; }
    cursor = ui.tool === 'rect' ? 'crosshair' : 'default';
  }

  /** Convert a pointer event into image-pixel coordinates. */
  function eventToImage(e: PointerEvent): { x: number; y: number } | null {
    if (!viewport || !doc.image || !dispFit) return null;
    const r = viewport.getBoundingClientRect();
    const cssX = e.clientX - r.left;
    const cssY = e.clientY - r.top;
    return {
      x: (cssX - dispFit.cssX0) / dispFit.scale,
      y: (cssY - dispFit.cssY0) / dispFit.scale
    };
  }

  /** Image-space → CSS-px helper for the SVG overlay. */
  function imgToCss(x: number, y: number): { x: number; y: number } {
    if (!dispFit) return { x: 0, y: 0 };
    return { x: dispFit.cssX0 + x * dispFit.scale, y: dispFit.cssY0 + y * dispFit.scale };
  }

  const handles: Array<{ corner: [number, number]; name: string }> = [
    { corner: [0, 0], name: 'nw' },
    { corner: [0.5, 0], name: 'n' },
    { corner: [1, 0], name: 'ne' },
    { corner: [1, 0.5], name: 'e' },
    { corner: [1, 1], name: 'se' },
    { corner: [0.5, 1], name: 's' },
    { corner: [0, 1], name: 'sw' },
    { corner: [0, 0.5], name: 'w' }
  ];

  /** Pick which handle (if any) is under a pointer position in CSS px, within ~10 CSS px tolerance. */
  function hitHandle(cssX: number, cssY: number): string | null {
    if (!hasRect || !fit) return null;
    const tol = 10;
    for (const h of handles) {
      const cx = doc.rect.x + doc.rect.w * h.corner[0];
      const cy = doc.rect.y + doc.rect.h * h.corner[1];
      const p = imgToCss(cx, cy);
      const dx = p.x - cssX;
      const dy = p.y - cssY;
      if (dx * dx + dy * dy <= tol * tol) return h.name;
    }
    return null;
  }

  function inRect(img: { x: number; y: number }): boolean {
    return img.x >= doc.rect.x && img.x <= doc.rect.x + doc.rect.w
      && img.y >= doc.rect.y && img.y <= doc.rect.y + doc.rect.h;
  }

  function inCrop(img: { x: number; y: number }): boolean {
    const c = doc.crop;
    if (!c) return false;
    return img.x >= c.x && img.x <= c.x + c.w && img.y >= c.y && img.y <= c.y + c.h;
  }

  /** True when there's room to translate the crop in at least one axis —
   *  i.e. the crop is strictly smaller than the image somewhere. When
   *  false, the cursor stays default over the crop margin since dragging
   *  would be a no-op. */
  function cropMovable(): boolean {
    if (!doc.image || !doc.crop) return false;
    return doc.crop.w < doc.image.width || doc.crop.h < doc.image.height;
  }

  function clampImg(p: { x: number; y: number }): { x: number; y: number } {
    if (!doc.image) return p;
    return {
      x: Math.max(0, Math.min(doc.image.width, p.x)),
      y: Math.max(0, Math.min(doc.image.height, p.y))
    };
  }

  function applyMods(rect: Rect, e: PointerEvent): Rect {
    // Shift snaps to the source image's aspect ratio — the most useful
    // case of the legacy aspect-chip and the only one we still expose
    // now that the chip strip is gone.
    if (e.shiftKey && doc.image) {
      return snapRectToAspect(rect, doc.image.width / doc.image.height);
    }
    return rect;
  }

  function cssPoint(e: PointerEvent): { x: number; y: number } | null {
    if (!viewport) return null;
    const r = viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startPinch(): void {
    if (!dispFit || activePointers.size < 2) return;
    const pts = [...activePointers.values()];
    const midCss = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (dist < 1) return;
    const midImg = {
      x: (midCss.x - dispFit.cssX0) / dispFit.scale,
      y: (midCss.y - dispFit.cssY0) / dispFit.scale
    };
    pinch = { startDist: dist, startZoom: zoom, midImg };
  }

  function updatePinch(): void {
    if (!pinch || !fit || activePointers.size < 2) return;
    const pts = [...activePointers.values()];
    const midCss = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (dist < 1) return;
    const z = clampZoom(pinch.startZoom * (dist / pinch.startDist));
    const newPanX = midCss.x - viewW / 2 + (fit.w * z) / 2 - pinch.midImg.x * fit.scaleCss * z;
    const newPanY = midCss.y - viewH / 2 + (fit.h * z) / 2 - pinch.midImg.y * fit.scaleCss * z;
    zoom = z;
    pan = z <= 1 ? { x: 0, y: 0 } : clampPan({ x: newPanX, y: newPanY });
  }

  function onPointerDown(e: PointerEvent) {
    if (!ready) return;
    const cp = cssPoint(e);
    if (!cp) return;
    activePointers.set(e.pointerId, cp);

    // Two pointers down → pinch mode. Cancel any single-pointer drag.
    if (activePointers.size === 2) {
      drag = null;
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
      startPinch();
      return;
    }
    if (activePointers.size > 2) return;

    // Single pointer. Existing rect logic + pan-tool / middle-mouse pan.
    const img = eventToImage(e);
    if (!img) return;
    dragMods = { shift: e.shiftKey, alt: e.altKey };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    // Middle-mouse drag → pan regardless of tool.
    if (e.button === 1) {
      drag = { kind: 'pan', startCss: cp, startPan: { ...pan } };
      return;
    }

    // Priority: handle > body > pan-tool-pan > marquee.
    // Tool affects the empty-area fallback only.
    const handle = hitHandle(cp.x, cp.y);
    if (handle) {
      const r = doc.rect;
      const oppX = handle.includes('w') ? r.x + r.w : (handle.includes('e') ? r.x : r.x + r.w / 2);
      const oppY = handle.includes('n') ? r.y + r.h : (handle.includes('s') ? r.y : r.y + r.h / 2);
      const signX: -1 | 1 = handle.includes('e') ? 1 : -1;
      const signY: -1 | 1 = handle.includes('s') ? 1 : -1;
      const centerStart = e.altKey ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
      drag = { kind: 'handle', name: handle, startRect: { ...r }, opposite: { x: oppX, y: oppY }, signX, signY, centerStart };
      return;
    }
    if (hasRect && inRect(img)) {
      drag = { kind: 'body', startRect: { ...doc.rect }, startImg: img };
      return;
    }
    // Zoomed-in nav: when the view is zoomed in, single-pointer drag
    // anywhere outside the nest (crop margin OR empty area) pans the
    // view. Crop translate isn't useful when zoomed (the user is
    // navigating the picture, not reframing it), and a new marquee
    // would obliterate the current selection. At fit-zoom this branch
    // is skipped so the desktop "draw to crop" / "drag crop margin"
    // affordances are preserved. Two-finger pinch is unchanged — its
    // branch above wins before we get here.
    if (hasRect && zoom > 1) {
      drag = { kind: 'pan', startCss: cp, startPan: { ...pan } };
      return;
    }
    // Crop margin (between the nest and the working-frame outline):
    // drag translates the crop while the nest stays put in image coords.
    // Skip when the crop has no room to move (fills the image on both
    // axes) — falling through to marquee/pan is more useful there.
    if (hasRect && doc.crop && inCrop(img) && cropMovable()) {
      drag = { kind: 'crop-body', startCrop: { ...doc.crop }, startImg: img };
      cursor = 'grabbing';
      return;
    }
    if (ui.tool === 'pan') {
      drag = { kind: 'pan', startCss: cp, startPan: { ...pan } };
      return;
    }
    if (ui.tool === 'rect') {
      drag = { kind: 'marquee', startImg: img };
      // Clear any prior rect/crop; the marquee will commit the new one
      // through commitResize on the first pointermove (so the crop
      // recentres on the nest, not on the now-stale prior crop).
      commitNewRect({ x: img.x, y: img.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: PointerEvent) {
    // Track every active pointer for pinch math.
    if (activePointers.has(e.pointerId)) {
      const cp = cssPoint(e);
      if (cp) activePointers.set(e.pointerId, cp);
    }
    if (pinch && activePointers.size >= 2) {
      updatePinch();
      return;
    }
    if (!drag) {
      updateCursor(e);
      return;
    }
    if (drag.kind === 'pan') {
      const cp = cssPoint(e);
      if (!cp) return;
      const dx = cp.x - drag.startCss.x;
      const dy = cp.y - drag.startCss.y;
      pan = clampPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
      return;
    }
    const img = eventToImage(e);
    if (!img) return;
    dragMods = { shift: e.shiftKey, alt: e.altKey };

    if (drag.kind === 'marquee') {
      const a = { x: Math.min(drag.startImg.x, img.x), y: Math.min(drag.startImg.y, img.y) };
      const b = { x: Math.max(drag.startImg.x, img.x), y: Math.max(drag.startImg.y, img.y) };
      let next: Rect = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      next = applyMods(next, e);
      // Marquee: each frame re-fits the crop to the growing rect. We
      // pass through commitNewRect (anchor = nest) rather than
      // commitResize (anchor = prev crop centre) so the crop tracks
      // the growing marquee rather than ballooning around stale state.
      commitNewRect(next);
      return;
    }
    if (drag.kind === 'body') {
      const dx = img.x - drag.startImg.x;
      const dy = img.y - drag.startImg.y;
      commitTranslate({
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
        w: drag.startRect.w,
        h: drag.startRect.h
      });
      return;
    }
    if (drag.kind === 'crop-body') {
      const dx = img.x - drag.startImg.x;
      const dy = img.y - drag.startImg.y;
      commitCropTranslate({
        x: drag.startCrop.x + dx,
        y: drag.startCrop.y + dy,
        w: drag.startCrop.w,
        h: drag.startCrop.h
      });
      return;
    }
    if (drag.kind === 'handle') {
      // Edge handles (n, s, e, w) constrain to a single axis — only the
      // perpendicular dimension changes; the parallel one stays. Without
      // this, dragging the top-middle handle horizontally collapses the
      // rect to zero width because the pointer's X relative to the rect
      // centre IS the new width.
      const onlyX = drag.name === 'e' || drag.name === 'w';
      const onlyY = drag.name === 'n' || drag.name === 's';
      let nx: number, ny: number, nw: number, nh: number;
      if (drag.centerStart) {
        // Alt: resize from centre. Edge handles still only flex one axis.
        const c = drag.centerStart;
        const dx = onlyY ? drag.startRect.w / 2 : Math.abs(img.x - c.x);
        const dy = onlyX ? drag.startRect.h / 2 : Math.abs(img.y - c.y);
        nw = dx * 2;
        nh = dy * 2;
        nx = c.x - nw / 2;
        ny = c.y - nh / 2;
      } else if (onlyX) {
        nw = Math.abs(img.x - drag.opposite.x);
        nh = drag.startRect.h;
        nx = drag.signX === 1 ? drag.opposite.x : drag.opposite.x - nw;
        ny = drag.startRect.y;
      } else if (onlyY) {
        nw = drag.startRect.w;
        nh = Math.abs(img.y - drag.opposite.y);
        nx = drag.startRect.x;
        ny = drag.signY === 1 ? drag.opposite.y : drag.opposite.y - nh;
      } else {
        // corner
        nw = Math.abs(img.x - drag.opposite.x);
        nh = Math.abs(img.y - drag.opposite.y);
        nx = drag.signX === 1 ? drag.opposite.x : drag.opposite.x - nw;
        ny = drag.signY === 1 ? drag.opposite.y : drag.opposite.y - nh;
      }
      let next: Rect = { x: nx, y: ny, w: nw, h: nh };
      next = applyMods(next, e);
      commitResize(next);
    }
  }

  function onPointerUp(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      // Pinch ends as soon as we drop below two pointers.
      pinch = null;
    }
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
    // Pan drags don't touch the rect — bail without the normalise pass.
    if (drag?.kind === 'pan') {
      drag = null;
      return;
    }
    if (!drag) return;
    // Crop-body drags don't touch the nest — skip the rect normalise
    // pass; commitCropTranslate already clamped the crop on every
    // frame and the nest is unchanged.
    const wasCropBody = drag.kind === 'crop-body';
    drag = null;
    if (doc.image && !wasCropBody) {
      // Normalise: clamp to image and ensure min size. Funnel through
      // commitResize so the crop refits if the clamp changed the rect's
      // dimensions, and clears when the rect collapses to zero.
      const minSide = 8;
      let r = doc.rect;
      r = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(doc.image.width - Math.max(0, r.x), r.w), h: Math.min(doc.image.height - Math.max(0, r.y), r.h) };
      if (r.w < minSide || r.h < minSide) {
        r = { x: 0, y: 0, w: 0, h: 0 };
      }
      commitResize(r);
    }
    markGestureEnd();
  }

  // ---- visual derived data for the overlay ----

  const overlayRect = $derived.by(() => {
    if (!hasRect || !dispFit) return null;
    const tl = imgToCss(doc.rect.x, doc.rect.y);
    // Size must use dispFit.scale (zoom-aware), not fit.scaleCss — otherwise
    // the rect's top-left tracks the image but its dimensions stay at zoom=1,
    // so it drifts as you zoom.
    return { x: tl.x, y: tl.y, w: doc.rect.w * dispFit.scale, h: doc.rect.h * dispFit.scale };
  });

  // The working-image crop is committed state (doc.crop) — shown as a
  // faded dashed outline so the user can see what region the renderer
  // is actually sampling. The crop stays put when the user translates
  // the nest, and only resizes on handle drags / fresh marquees; this
  // gives a stable reference frame instead of a working window that
  // chases the cursor.
  const overlayCrop = $derived.by(() => {
    if (!hasRect || !dispFit || !doc.crop) return null;
    const c = doc.crop;
    const tl = imgToCss(c.x, c.y);
    return { x: tl.x, y: tl.y, w: c.w * dispFit.scale, h: c.h * dispFit.scale };
  });

  // Morph-shape outlines as SVG paths (ellipse ⇄ rectangle via shapeAnim.morph),
  // so the selection, its dim-mask cutout, and the working-frame outline all
  // animate together with the toggle. `inset` keeps a stroke inside its box.
  function boxPath(box: { x: number; y: number; w: number; h: number }, inset: number, m: number): string {
    return pathD(
      shapeBoundary(
        box.x + box.w / 2,
        box.y + box.h / 2,
        Math.max(0, box.w / 2 - inset),
        Math.max(0, box.h / 2 - inset),
        m
      )
    );
  }
  // Pass shapeAnim.morph explicitly so the read happens in each derived's own
  // closure — the paths re-derive as the morph animates.
  const selCutoutD = $derived(overlayRect ? boxPath(overlayRect, 0, shapeAnim.morph) : '');
  const selOutlineD = $derived(overlayRect ? boxPath(overlayRect, 0.75, shapeAnim.morph) : '');
  const cropOutlineD = $derived(overlayCrop ? boxPath(overlayCrop, 0.5, shapeAnim.morph) : '');
</script>

<section class="stage" class:has-image={!!doc.image}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    bind:this={viewport}
    style:cursor={cursor}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onpointerleave={() => { if (!drag) cursor = 'default'; }}
  >
    {#if doc.image}
      <canvas
        bind:this={imageCanvas}
        class="layer image"
        style:left="{dispFit?.cssX0 ?? 0}px"
        style:top="{dispFit?.cssY0 ?? 0}px"
        style:width="{dispFit?.w ?? 0}px"
        style:height="{dispFit?.h ?? 0}px"
      ></canvas>
      {#if overlayRect}
        <svg class="overlay" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="ui1-mask">
              <rect width="100%" height="100%" fill="white" />
              <path d={selCutoutD} fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.32)" mask="url(#ui1-mask)" />
          {#if overlayCrop}
            <!-- working frame: dashed faded outline of what the renderer
                 actually samples — the morph shape inscribed in the crop
                 (the outer ring of the self-similar plane). -->
            <path
              d={cropOutlineD}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              stroke-width="1"
              stroke-dasharray="6 4"
            />
          {/if}
          <path d={selOutlineD} fill="none" stroke="var(--accent)" stroke-width="1.5" />
          <!-- thirds grid -->
          <g opacity="0.5" stroke="white" stroke-width="1" stroke-dasharray="4 4">
            <line x1={overlayRect.x + overlayRect.w / 3} y1={overlayRect.y} x2={overlayRect.x + overlayRect.w / 3} y2={overlayRect.y + overlayRect.h} />
            <line x1={overlayRect.x + (2 * overlayRect.w) / 3} y1={overlayRect.y} x2={overlayRect.x + (2 * overlayRect.w) / 3} y2={overlayRect.y + overlayRect.h} />
            <line x1={overlayRect.x} y1={overlayRect.y + overlayRect.h / 3} x2={overlayRect.x + overlayRect.w} y2={overlayRect.y + overlayRect.h / 3} />
            <line x1={overlayRect.x} y1={overlayRect.y + (2 * overlayRect.h) / 3} x2={overlayRect.x + overlayRect.w} y2={overlayRect.y + (2 * overlayRect.h) / 3} />
          </g>
          <!-- 8 handles -->
          {#each handles as h}
            {@const cx = overlayRect.x + overlayRect.w * h.corner[0]}
            {@const cy = overlayRect.y + overlayRect.h * h.corner[1]}
            <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" fill="white" stroke="var(--accent)" stroke-width="1.5" rx="2" />
          {/each}
        </svg>
        <!-- dimension badge -->
        <span
          class="badge mono"
          style:left="{overlayRect.x}px"
          style:top="{overlayRect.y + overlayRect.h + 6}px"
        >{Math.round(doc.rect.w)} × {Math.round(doc.rect.h)}</span>
      {/if}
      <!-- HUD: zoom chip + coords (only once we have a fit ratio). -->
      {#if fit && dispFit}
        <div class="hud-tl mono">
          {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          · {Math.round(fit.scaleCss * dispFit.zoom * 100)}%
        </div>
        {#if hasRect}
          <div class="hud-br mono">{Math.round(doc.rect.x)}, {Math.round(doc.rect.y)} · {Math.round(doc.rect.w)}×{Math.round(doc.rect.h)}</div>
        {/if}
      {/if}
      {#if !hasRect}
        <div class="draw-hint">
          <span>Drag a rectangle on your photo — that's the part that spirals into itself.</span>
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .stage {
    flex: 1;
    background: var(--canvas-bg);
    position: relative;
    overflow: hidden;
    display: flex;
  }
  .viewport {
    position: absolute;
    /* Reduced from 24px to 8px so narrow panes don't lose 48px of every
       axis to decorative dark margin. Editing space matters more than the
       drop-shadow framing. */
    inset: 8px;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    touch-action: none;
    /* cursor is set dynamically via style:cursor in the markup. */
  }
  .stage:not(.has-image) .viewport { box-shadow: none; }
  .layer { position: absolute; display: block; }
  .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  /* Cold-start prompt: shown over the photo until the first rectangle is drawn. */
  .draw-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    padding: 16px;
  }
  .draw-hint span {
    background: var(--ink);
    color: var(--bg);
    opacity: 0.92;
    padding: 9px 15px;
    border-radius: 999px;
    font-size: 13px;
    line-height: 1.35;
    max-width: 24em;
    text-align: center;
    box-shadow: var(--shadow);
  }
  .badge {
    position: absolute;
    background: var(--accent);
    color: #fff;
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .hud-tl, .hud-br {
    position: absolute;
    background: rgba(0,0,0,0.5);
    color: rgba(255,255,255,0.85);
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-family: var(--font-mono);
    pointer-events: none;
  }
  .hud-tl { top: 8px; left: 12px; }
  .hud-br { bottom: 8px; right: 12px; }
  .mono { font-family: var(--font-mono); }
</style>
