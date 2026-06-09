# Tententoon — Svelte 5 build handoff

A local-only Droste-effect web app. Upload an image, frame a rectangle inside it, get a recursive image and an infinite-zoom loop. Export as PNG, MP4, or GIF. **No backend** — everything happens in the browser.

Design: **Approach C · Tool App** (see `hifi/index.html`). Top bar · left tool rail · canvas · right inspector · bottom timeline.

---

## 1 · Stack

| Layer       | Choice                                   | Why |
|-------------|------------------------------------------|-----|
| Framework   | **Svelte 5** (runes) + Vite              | Per requested. Runes (`$state`, `$derived`, `$effect`) replace stores for local UI state. |
| Styling     | **Plain CSS + CSS custom properties**    | Tokens live in `tokens.css`; theme swap = class on `<html>`. No utility-CSS lock-in. |
| State       | `$state` for UI, one `app.svelte.js` rune module for app-wide state (current image, rect, playback) | Keeps things flat; no Redux/Pinia. |
| Image core  | `<canvas>` + `OffscreenCanvas`           | All rendering goes through one Droste pipeline. |
| Video out   | `MediaRecorder` on a captured `canvas`   | Native, zero deps, ~ universally supported for WebM/MP4. |
| GIF out     | [`gifenc`](https://github.com/mattdesl/gifenc) (~10 KB, fast, MIT) | Smaller and faster than `gif.js`. Run in a Worker. |
| Icons       | [`lucide-svelte`](https://lucide.dev)    | Matches the icon style used in the mock. Tree-shaken. |
| Drop / files| Plain `<input type="file">` + drop listeners on root | No deps. |
| Tests       | Vitest (optional)                        | At minimum: smoke tests for the droste transform math. |

Hosting: any static host (Netlify / Vercel / GitHub Pages). `vite build` → `dist/`. **Cross-origin isolation headers** (`COOP: same-origin`, `COEP: require-corp`) are required if you ever want `SharedArrayBuffer` (you probably don't — `gifenc` doesn't need it).

---

## 2 · Project layout

```
src/
  app.svelte                    -- root layout (top bar / rail / canvas / inspector / timeline)
  app.svelte.js                 -- shared $state runes (image, rect, playback, ui)
  lib/
    components/
      TopBar.svelte
      ToolRail.svelte
      CanvasStage.svelte        -- the editor canvas
      RectOverlay.svelte        -- 8 handles + dim mask + thirds grid
      Inspector.svelte
      Timeline.svelte
      ExportMenu.svelte         -- dropdown from Export button
      DropZone.svelte
    droste/
      render.js                 -- core draw-image-into-rect pipeline (canvas)
      transform.js              -- maths: nested rect chain, time→scale mapping
      export-png.js
      export-mp4.js             -- MediaRecorder
      export-gif.js             -- gifenc worker driver
      gif.worker.js
    util/
      file.js                   -- load file/blob → ImageBitmap
      keys.js                   -- ⌘E etc.
  styles/
    tokens.css                  -- :root.theme-* { --bg, --panel, --accent, ... }
    base.css                    -- resets + Inter import
  main.js
  app.html
```

Notes
- Prefer `ImageBitmap` over `HTMLImageElement` everywhere — faster and `transferControlToOffscreen`-friendly.
- One `<canvas>` element is the source of truth for what the user sees and what gets exported. Don't render twice.

---

## 3 · State model (`app.svelte.js`)

A single module of runes:

```js
// app.svelte.js
import { writable } from 'svelte/store'; // not needed — use runes:

export const ui = $state({
  tool: 'rect',          // 'select' | 'rect' | 'pan'
  zoom: 'fit',           // 'fit' | number
  exportMenuOpen: false,
  theme: 'light-neutral'
});

export const doc = $state({
  image: null,           // ImageBitmap | null
  imageName: '',
  rect: { x: 0, y: 0, w: 0, h: 0 },    // px in image-space
  aspect: 'match-image'  // 'match-image' | 'free' | '1:1' | '16:9' | ...
});

export const playback = $state({
  playing: false,
  t: 0,                  // 0..1 progress through the loop
  speed: 1,              // 0.5 | 1 | 2 | 4
  direction: 'in',       // 'in' | 'out'
  loopLength: 10         // seconds
});
```

The whole app reacts to these. **State machine**: `Empty (no image) → Framing (image, no rect) → Edit (rect exists, paused) → Playing → Exporting`. Each maps to which screen/components are interactive.

---

## 4 · The droste algorithm

The whole effect is one transform: **map the outer image rectangle to the user's inner rectangle**, then paint the source image again at that mapped position, repeatedly.

```js
// transform.js
export function nestedFrames(imageRect, innerRect, depth) {
  // Both rects in the same coordinate space (image pixels).
  // Returns an array of {x, y, w, h} starting with the outermost.
  const frames = [];
  let cur = { ...imageRect };
  for (let i = 0; i < depth; i++) {
    frames.push(cur);
    const sx = innerRect.w / imageRect.w;
    const sy = innerRect.h / imageRect.h;
    cur = {
      x: cur.x + (innerRect.x - imageRect.x) * (cur.w / imageRect.w),
      y: cur.y + (innerRect.y - imageRect.y) * (cur.h / imageRect.h),
      w: cur.w * sx,
      h: cur.h * sy
    };
  }
  return frames;
}

export function maxUsefulDepth(imageRect, innerRect, minPx = 1) {
  // depth at which the inner rect would be < minPx wide
  const ratio = Math.min(innerRect.w / imageRect.w, innerRect.h / imageRect.h);
  return Math.ceil(Math.log(minPx / Math.min(imageRect.w, imageRect.h)) / Math.log(ratio));
}
```

### Drawing a single still frame

```js
// render.js
export function drawDroste(ctx, image, imageRect, innerRect, depth) {
  const frames = nestedFrames(imageRect, innerRect, depth);
  // Paint from outermost to innermost so each inner copy lands inside the
  // previous painted rectangle. ctx.imageSmoothingQuality = 'high'.
  for (const f of frames) {
    ctx.drawImage(image, f.x, f.y, f.w, f.h);
  }
}
```

### The infinite-zoom animation

Two tricks:

1. **Logarithmic time-to-scale.** Map `t ∈ [0, 1]` to a continuous scale factor that crosses one level of recursion per loop, so after a full loop the frame is identical to t=0 → seamless loop.

   ```js
   // ratio = innerRect.w / imageRect.w  (assume aspect-matched; clamp otherwise)
   const scale = Math.pow(ratio, direction === 'in' ? t : -t);
   ```

2. **Sliding window of frames.** Don't redraw `depth` frames from scratch each tick; keep the same nested-frames chain but **apply a single `ctx.scale(s, s)` around the rect's center** before drawing, then `ctx.translate` so the rect-center stays put. As `t` crosses 1, the outermost frame falls off the edge and a new innermost frame is appended — visually seamless because the geometry is self-similar.

Render loop:

```js
function tick(now) {
  if (playback.playing) {
    playback.t = (playback.t + dt * playback.speed / playback.loopLength) % 1;
  }
  requestAnimationFrame(tick);
  draw();
}
```

Aspect mismatch (rect aspect ≠ image aspect) causes asymmetric scaling — the simplest fix is **letterboxing the rect to image aspect** when `aspect = 'match-image'`. Document this in the UI (it's already the default chip).

---

## 5 · Export

All three export paths run on the **same canvas pipeline** but with different sinks.

### PNG

```js
const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
downloadBlob(blob, 'tententoon.png');
```

### MP4 (or WebM)

```js
const stream = canvas.captureStream(60);
const rec = new MediaRecorder(stream, {
  mimeType: 'video/mp4;codecs=avc1',         // Safari/Chrome
  videoBitsPerSecond: 6_000_000
});
const chunks = [];
rec.ondataavailable = e => chunks.push(e.data);
rec.start();
// Run the animation for loopLength * 1000 ms, then:
rec.stop();
rec.onstop = () => downloadBlob(new Blob(chunks, { type: rec.mimeType }), 'tententoon.mp4');
```

Fallback: if `video/mp4` isn't supported, fall back to `video/webm;codecs=vp9` and let users transcode if they really need .mp4.

### GIF

Use `gifenc` in a worker so the UI thread stays smooth:

```js
// gif.worker.js
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

self.onmessage = ({ data: { frames, delay, width, height } }) => {
  const enc = GIFEncoder();
  for (const rgba of frames) {
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    enc.writeFrame(index, width, height, { palette, delay });
  }
  enc.finish();
  self.postMessage(enc.bytesView(), [enc.bytesView().buffer]);
};
```

Sample at ~15–20 fps to keep size reasonable; cap at 720p.

---

## 6 · Components — props & responsibilities

| Component       | Props                                | Owns                                  | Emits / mutates                         |
|-----------------|--------------------------------------|---------------------------------------|-----------------------------------------|
| `TopBar`        | —                                    | Logo, filename pill, reset/replace/export buttons | `ui.exportMenuOpen`, opens file picker |
| `ToolRail`      | —                                    | Tool buttons (cursor/rect/pan) + zoom in/out | `ui.tool`, `ui.zoom` |
| `CanvasStage`   | —                                    | The single `<canvas>`, pointer handling for the active tool, fit-to-viewport | Calls `render()`; updates `doc.rect` on drag |
| `RectOverlay`   | `rect`                               | 8 handles, dim mask, thirds grid, dimension badge | Hit-tested by `CanvasStage` |
| `Inspector`     | —                                    | Rectangle section + Playback section, scrolls if cramped | Mutates `doc.rect`, `playback.*` |
| `Timeline`      | —                                    | Play/pause, progress bar, ticks, playhead | Mutates `playback.t`, `playback.playing` |
| `ExportMenu`    | `open`                               | Dropdown of 3 export targets             | Triggers `lib/droste/export-*` |
| `DropZone`      | `active`                             | Empty-state CTA + drag-over highlight     | Loads file → `doc.image` |

Most components touch only `app.svelte.js` runes — no prop drilling.

### Rectangle hit-testing

The 8 handles correspond to `nw, n, ne, e, se, s, sw, w`. Pointer-down within ~10 px of a handle starts a resize; pointer-down inside the rect starts a move; outside starts a fresh marquee (replacing the rect). Hold **Shift** while dragging to lock aspect. Hold **Alt** to resize from center. Arrow keys nudge by 1 px (Shift+arrow = 10 px). All standard fare.

---

## 7 · Tokens & theming

`tokens.css` (excerpt):

```css
:root.theme-light-neutral {
  --bg: #fafaf7; --panel: #fff; --panel-2: #f4f2ec;
  --border: #e6e3dc; --border-strong: #d3cec3;
  --ink: #1a1814; --ink-2: #4a463f; --muted: #8a857a;
  --accent: #d94f2c; --accent-soft: rgba(217,79,44,0.10);
  --canvas-bg: #2a261f;
}
:root.theme-light-warm { /* ... see hifi/screens.jsx tokens block */ }
:root.theme-dark-warm  { /* ... */ }
```

Theme switch is one `document.documentElement.classList.replace('theme-...', 'theme-...')` call. Every component reads from `var(--*)` only — no hard-coded hex.

**Stick to one direction at launch.** The other two are there to support a quick mood pivot if needed.

---

## 8 · Acceptance checklist

- [ ] Drag-drop / click-pick / paste loads JPG, PNG, WebP up to 20 MB
- [ ] User can both **marquee-drag** to draw a fresh rect and **resize/drag** an existing one (8 handles + body)
- [ ] Shift locks aspect; Alt resizes from center; arrow keys nudge
- [ ] Rect snaps to image aspect when "Match image" chip is active
- [ ] Still frame renders at full image resolution on PNG export (not just the on-screen canvas resolution — render to an offscreen canvas sized to the image)
- [ ] MP4 export produces a clean **seamless loop** (last frame ≈ first frame)
- [ ] GIF stays under ~10 MB at 720p for a 10s loop
- [ ] Works fully offline once loaded
- [ ] No network requests after page load (verify in DevTools)
- [ ] Keyboard: Space = play/pause · `[`/`]` = scrub · ⌘E = export menu · Esc = close menu

---

## 9 · Out of scope (intentionally)

Per the spec, **no effect knobs** beyond the rectangle: no rotation per iteration, no scale ratio override, no fade/feather. If you find yourself reaching for them, push back to design first.

---

## 10 · Open questions for design

1. Behavior when **image aspect ≠ rect aspect** with "Free" chip active. (Currently: stretches. Better: letterbox? mirror?)
2. **Max depth** cutoff. Render until inner rect is < 1 px? 2 px? (Performance vs. fidelity.)
3. Should the **rectangle persist** when the user replaces the image? (Lean: yes, in normalized 0–1 coords.)
4. **Loop length** range — currently 2–30 s in the inspector? Cap?

Ping me on any of these and I'll spec.

---

*Designs: `hifi/index.html`. Wireframes: `wireframes/index.html`. Both can be opened directly in a browser.*
