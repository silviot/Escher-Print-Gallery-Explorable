# tententoon gallery

A reusable Svelte 5 gallery over the app's actual Droste / log-polar rendering pipeline. The standalone exhibition lives at `/gallery/`, `/gallery/passage.html`, and `/gallery/cabinet.html`.

Read [Choosing and generating images for tententoon](../../../docs/IMAGE-CANDIDATES.md) before adding sources. It includes reusable prompts, composition and crop guidance, and the browser review checklist.

```svelte
<script lang="ts">
  import { TententoonGallery, type GalleryItem } from './lib/gallery';
  const items: GalleryItem[] = [{
    id: 'my-picture',
    title: 'Before the shutter',
    description: 'Follow an ordinary lens into a smaller copy of the room.',
    src: '/gallery-images/natural-camera.webp',
    thumbnail: '/gallery-images/natural-camera-thumb.webp',
    alt: 'A camera with a normal dark glass lens and red strap on a wooden table.',
    category: 'My collection',
    nest: { x: .443, y: .481, w: .148, h: .151 },
    shape: 'ellipse'
  }];
</script>

<TententoonGallery {items} variant="cabinet" onselect={(item) => console.log(item.id)} />
```

- `cinema`: one large image and a filmstrip. A tour starts automatically: original (5 seconds), ease into Droste (5), explore the repetition (14), bend into tententoon (7), follow the spiral (16), then fade to the next preloaded image. Pause/Resume preserves your place. Any manual image selection or transformation control pauses the tour. Hidden tabs and offscreen images pause both timing and motion; reduced-motion users advance manually.
- `passage`: a sticky image changes as three chapters scroll past; stage buttons provide direct access.
- `cabinet`: a filterable contact sheet with a keyboard-accessible image dialog.

Cinema’s Fullscreen button (or `F`) presents the whole gallery at viewport size, preserving the artwork’s proportions. It uses native fullscreen when available and a fixed viewport fallback otherwise. Controls fade after 3.2 seconds of inactivity during the tour; pointer movement, a tap, or keyboard interaction reveals them. Pausing keeps them visible. `Space` pauses/resumes, arrow keys choose an image, and `Escape` exits and restores focus and scroll position. The Collection drawer pauses the tour while browsing. Keyboard focus stays within the presentation.

`initialId` chooses the initial artwork. Cabinet uses it when opening the collection; clicking a tile opens that tile. `onselect` reports image selection without touching app state or routing. The standalone shell uses it to keep a shareable `?image=` URL across variations. Category filters derive from the supplied data. There is no dependency on the editor, persistence, or the sample collection.

For an individual embedded artwork, import `ArtworkStage` and supply `item`, `progress` (0 = original, 1 = Droste, 2 = tententoon) and `playing`. Progress is continuously interpolated; playing animates the inward zoom, not the transformation stage. The source remains still at 0 and fades into the full rendered working frame. Droste zooms the entire frame, including the periphery; the same zoom phase continues while the transformation bends into the spiral. Optional `onready(item)` and `onerror(item)` callbacks allow a host to wait for image decoding.

Nest coordinates are fractions of source width/height and should cover the entire intended opening. Equal normalized width and height preserve the source aspect. Other proportions use the renderer's working crop: during original→Droste, the viewport smoothly reframes into that crop and retains its aspect within the square stage. This avoids cutting through existing roofs, frames, or other parts of an already-recursive source. The selected shape determines how the copies repeat throughout the rendered frame.

Images must be same-origin, blob/data URLs, or allow anonymous CORS. Keep IDs unique and stable. Supply a nest fully within the source, with each dimension greater than 0 and less than 1. Source images may already contain artistic recursion: “Original” always means the supplied image, not a claim that it is an unedited photograph.

The stage caches up to three decoded scenes, pauses offscreen and when the tab is hidden, caps GPU resolution, and releases its renderer on teardown. A separate canvas supplies a bounded CPU fallback without WebGL2. Reduced-motion users get immediate stage changes and no automatic zoom. Image errors have a retry action.

The standalone sample manifest is `src/gallery/collection.ts`. Its 12 ordinary photographic sources contain no generated recursion: all repeated copies come from the renderer. Openings are roughly 10–19% of source width, with at least 30% margin to every source edge. Each source was inspected as an original, Droste image, and spiral. `python3 scripts/prepare-gallery-images.py` rebuilds the WebP display images and thumbnails from `assets/examples/natural-sources/` (requires Pillow), without changing their content. That directory also preserves the exact image-generation prompts and provenance. Earlier recursive concepts remain archived outside the current collection.

Validation: `npm run check`, `npm test`, `npm run build`. Browser interaction coverage is in `scripts/gallery-smoke.mjs`; `scripts/gallery-tour-smoke.mjs` watches a complete automatic cycle at its actual pace (about a minute), then checks pause/resume, manual takeover, offscreen pause, and reduced motion. `scripts/gallery-fullscreen-smoke.mjs` checks native fullscreen exit, idle controls, focus restoration, touch reveal, and portrait/landscape fallback layouts. Run with Playwright available, or set `PLAYWRIGHT_MODULE` to its installed module path. `GALLERY_URL` defaults to `http://127.0.0.1:5186/gallery/`; `CHROME_PATH` optionally selects installed Chrome.

The standalone galleries can be published additively: upload `dist/gallery/`, `dist/gallery-images/`, and their imported hashed assets. A gallery preview does not require replacing the homepage or editor.

For the current pgs.sh deployment, upload images and hashed assets before the gallery HTML, then run `ssh pgs.sh cache tententoon --write`. The shared HTTP cache can otherwise serve the previous collection at `/gallery/` or a variation page after its files have been replaced. Verify the public URLs after clearing it.
