# Ordinary sources for tententoon

Twelve photographic images generated with the built-in `image_gen` tool on 2026-09-07. These are generated scenes, not documentary photographs of actual places. Every source is deliberately ordinary and contains no recursive imagery. The gallery renderer creates all Droste repetitions and spirals.

For new candidates, use the [selection and generation guide](../../../docs/IMAGE-CANDIDATES.md). It consolidates the composition rules, size heuristics, reusable prompts, failed approaches and browser acceptance process behind this collection.

The sources replace the earlier recursive concepts in the current gallery. The original PNGs are preserved here; browser derivatives are `public/gallery-images/natural-*.webp`. Run `python3 scripts/prepare-gallery-images.py` from the repository root to rebuild the display images and thumbnails.

Exact final prompts, original generated file paths, and source inspection notes:

- [Objects: camera, coffee, radio, watch](objects-prompts.json)
- [Places: greenhouse, boat, cabin, garden window](places-prompts.json)
- [Still life: guitar, laundry, frame, record](still-life-prompts.json)

The guitar received a targeted edit to bring the camera closer; the rejected wider version is not used. No source contains a pre-generated Droste effect. Image resizing and WebP encoding do not change the depicted content.

Final aperture coordinates live in `src/gallery/collection.ts`. They cover the normal lens glass, coffee, speaker grille, watch face, doorway, window glass, sound hole, backing board or record label. Apertures are approximately 10–19% of source width, with at least 30% margin to every image edge. Each was inspected in the actual `ArtworkStage` at original, Droste and tententoon stages; all twelve passed the source and join review. Camera, coffee, frame and record are particularly clear demonstrations.

The renderer zooms the full working frame. Rectangular openings retain their aspect; the greenhouse therefore reframes into a portrait view during the first transition. Elliptical repetition includes the larger outer rim as well as the smaller inner copies.

[Rendered pixel audit](render-audit.json): all 36 sampled WebGL frames were fully opaque. Changing the Droste zoom phase changed 88.5–98.8% of pixels in the outer 15% of each image, confirming that the periphery moves. Effective inner-copy sizes are 10.4–19.4% of the working frame. The gallery browser checks also cover the composited periphery, pause/resume, the complete automatic tour, reduced motion, fullscreen and mobile layouts.
