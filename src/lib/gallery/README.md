# tententoon gallery

A reusable Svelte 5 gallery over the app's actual Droste / log-polar rendering pipeline. The standalone exhibition lives at `/gallery/`, `/gallery/passage.html`, and `/gallery/cabinet.html`.

```svelte
<script lang="ts">
  import { TententoonGallery, type GalleryItem } from './lib/gallery';
  const items: GalleryItem[] = [{
    id: 'my-picture',
    title: 'A world inside',
    description: 'Follow the opening into the same scene again.',
    src: '/pictures/world.webp',
    thumbnail: '/pictures/world-small.webp',
    alt: 'A courtyard with a smaller courtyard inside a doorway.',
    category: 'My collection',
    nest: { x: .3, y: .3, w: .4, h: .4 },
    shape: 'rect'
  }];
</script>

<TententoonGallery {items} variant="cabinet" onselect={(item) => console.log(item.id)} />
```

- `cinema`: one large image, a filmstrip, manual scrubbing and a paced automatic journey.
- `passage`: a sticky image changes as three chapters scroll past; stage buttons provide direct access.
- `cabinet`: a filterable contact sheet with a keyboard-accessible image dialog.

`initialId` chooses the initial artwork. Cabinet uses it when opening the collection; clicking a tile opens that tile. `onselect` reports image selection without touching app state or routing. The standalone shell uses it to keep a shareable `?image=` URL across variations. Category filters derive from the supplied data. There is no dependency on the editor, persistence, or the sample collection.

For an individual embedded artwork, import `ArtworkStage` and supply `item`, `progress` (0 = original, 1 = Droste, 2 = tententoon) and `playing`. Progress is continuously interpolated; playing animates the inward zoom, not the transformation stage. The source remains still at 0. The frame displays a centered square cover of the source. Nest coordinates are fractions of source width/height; use equal normalized width and height to preserve the source aspect. Different nest aspect ratios use the existing renderer's working crop.

Images must be same-origin, blob/data URLs, or allow anonymous CORS. Keep IDs unique and stable. Supply a nest fully within the source, with each dimension greater than 0 and less than 1. Source images may already contain artistic recursion: “Original” always means the supplied image, not a claim that it is an unedited photograph.

The stage caches up to three decoded scenes, pauses offscreen and when the tab is hidden, caps GPU resolution, and releases its renderer on teardown. A separate canvas supplies a bounded CPU fallback without WebGL2. Reduced-motion users get immediate stage changes and no automatic zoom. Image errors have a retry action.

The standalone sample manifest is `src/gallery/collection.ts`. `python3 scripts/prepare-gallery-images.py` rebuilds its WebP display images and thumbnails from the preserved generated PNGs (requires Pillow). It does not alter the original artwork. The 16 images include every unique generated source from this exploration, including three early studies.

Validation: `npm run check`, `npm test`, `npm run build`. Browser interaction coverage is in `scripts/gallery-smoke.mjs`; run with Playwright available, or set `PLAYWRIGHT_MODULE` to its installed module path. `GALLERY_URL` defaults to `http://127.0.0.1:5186/gallery/`; `CHROME_PATH` optionally selects installed Chrome.

The standalone galleries can be published additively: upload `dist/gallery/`, `dist/gallery-images/`, and their imported hashed assets. A gallery preview does not require replacing the homepage or editor.
