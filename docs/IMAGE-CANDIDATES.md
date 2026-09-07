# Choosing and generating images for tententoon

Start with an ordinary image containing one small, clearly bounded place where a copy of the whole image could fit. Let the tool create every repetition. Judge the result in motion, through original → Droste → tententoon.

This guide records the selection and generation lessons from the photographic gallery. Use it when taking photographs, choosing existing images, or prompting an image generator. The [current collection](../src/gallery/collection.ts) and [saved sources, prompts and audit](../assets/examples/natural-sources/README.md) provide worked examples.

## What makes a strong candidate

- **An ordinary source.** A camera has normal lens glass; coffee is plain liquid; a window has an ordinary interior or reflection. No miniature version of the scene, nested world, duplicated building or recursive picture is already present. The original should make sense before the effect starts.
- **One small target surface or opening.** A lens, cup, speaker grille, watch face, window, frame backing or record label gives the repetition a clear boundary. It need not be an empty hole or a dark surface. A blank cream record label works too.
- **A clear, complete rim.** Keep the cup lip, metal lens ring, window frame or doorway intact around the selected interior. The next copy should begin inside that boundary. Avoid having to cut through a roof, handle or other recognizable structure to make the selection fit.
- **Simple geometry.** Front-on circles, squares and modest rectangles are easier to fit than irregular arches, strongly tilted ellipses or trapezoids. Keep the camera approximately perpendicular to the target surface. The current gallery supports axis-aligned rectangles and ellipses, not arbitrary silhouettes or perspective correction.
- **Enough surrounding picture.** The opening should sit well inside the image, with useful context on every side. A strap, spoon, wood grain, bricks, plants or a patch of color gives the eye something to follow as the whole frame zooms and bends.
- **A readable subject at several scales.** The picture should still be recognizable when reduced to a small copy. Prefer a few strong shapes and material contrasts over many tiny objects. Keep enough detail and depth of field around the opening to make the repeated copies readable.

For this public gallery, objects and places are the default. People can be compelling when the viewer cares about them personally; attractive strangers are a weaker generic hook. Photographic sources should feel like observed life, with plausible materials, scale, light and wear. Photorealism is a curation preference, not a mathematical requirement of the effect.

## Size, position and crop

Aim initially for an opening around **10–20% of the source width**, near the center, with roughly **30% or more of the source dimension between its boundary and each image edge**. These are useful starting points from the current collection, not validity limits or guarantees of beauty. Slightly off-center subjects work: the radio's speaker is left of center.

Smaller openings usually leave more surrounding context and more separation between copies. Smaller is not always better: our first full-guitar view made its sound hole about 8% of image width and too inconspicuous. A closer framing produced a clearer result around 12%, while allowing the upper neck to leave the image. Do not force an entire tall object into a square photo at the expense of the opening.

Check the **working crop** as well as the source. The renderer fits a crop with the opening's pixel aspect ratio so the next copy shrinks equally in both dimensions. A narrow doorway can turn a square source into a portrait working image and remove important surroundings. In the current greenhouse, the opening is 10.9% of source width but 19.4% of working-crop width. Preview that reframing before accepting it; consider a different source composition if the crop loses the subject.

For a source of size `W × H` and a normalized nest `{x, y, w, h}`:

```text
Source margins: left=x, right=1-x-w, top=y, bottom=1-y-h
Pixel opening:  width=w*W, height=h*H
Working-crop fractions: openingWidth/cropWidth, openingHeight/cropHeight
```

Horizontal fractions use image width; vertical fractions use image height. Final crop fractions should match because the crop and opening have the same aspect. The shrink factor is `S = cropWidth / openingWidth`. See [crop geometry](../src/lib/math/droste.ts) and [scene preparation](../src/lib/gallery/renderer.ts). Measure actual output; requested prompt percentages are only composition hints.

## Prompting new sources

Describe the normal photograph positively. Specify the target's ordinary contents, small size, orientation and surrounding scene. Keep “Droste,” “infinite,” “portal,” and “world inside a world” out of the positive scene description: they can encourage the generator to make the effect itself. Explicitly exclude recursive imagery.

Use the configured image-generation tool and its workflow. The prompt template below is independent of a particular generator. Replace the bracketed fields, then generate one source image per concept.

```text
Create one [square / chosen aspect] natural documentary-style photograph of
[one ordinary subject] in [a believable setting].

The subject has one [round lens / cup surface / square window / other target].
Its interior is ordinary [dark optical glass / plain coffee / unlit interior /
blank backing / normal clock face], with no picture or miniature scene inside.
The interior is about [12–18]% of the entire image width, centered near
[x=50%, y=50%]. Show its complete physical rim, unobstructed and well inside
all image edges. Photograph the surface straight-on so it is [round / square].

Show generous surrounding [table, wall, room, garden, etc.], with
[two or three useful textures or visual anchors]. Use believable natural
light, material wear and physical scale. Keep the subject and its immediate
surroundings readable. This should look like an ordinary photograph before
any effect is applied.

No recursion, nested copies, repeated scenes, tiny versions of the subject,
surreal interiors or tunnels of duplicates. No additional target objects,
people, branding, captions or watermark. Avoid glossy CGI or advertising styling.
```

Ready-to-use examples:

**Camera.** A square natural photograph of one worn black-and-silver camera facing the viewer on a wooden table. Its single normal dark glass lens faces the camera straight-on; the glass disk is about 15% of the entire image width, near the center, with an intact metal rim. Show the whole camera, a loose faded red strap and generous table and room context in ordinary window light. Real scuffs, wood grain and moderate depth of field. The lens contains only ordinary optical glass and subtle highlights. No camera or scene inside the lens, recursive copies, miniature worlds, duplicated cameras, people, text or watermark.

**Empty frame.** A square ordinary photograph of one small wooden picture frame standing almost perfectly front-on on an artist's workbench. Its square interior is plain dark backing board, about 16% of the photograph's width and height, near the center. Keep all four wooden edges visible. Include a jar of brushes, a paint-marked cloth, worn table and quiet wall, with plenty of space around the frame. Soft natural light and plausible materials. No artwork in the frame, nested frame, repeated studio, miniature scene, extra frames, people or text.

**Porthole.** A square ordinary photograph of a weathered small boat moored beside a pier. View the cabin side straight-on. It has one unobstructed brass-rimmed circular porthole, with normal dark glass about 12–16% of the full image width, near the center. Keep broad context of hull, rope, pier and water. Natural overcast light, salt stains and believable wear. No boat or recognizable scene inside the glass, nested portholes, repeated shorelines, recursive imagery, people or text.

For twelve complete prompts and their actual generated results, see [objects](../assets/examples/natural-sources/objects-prompts.json), [places](../assets/examples/natural-sources/places-prompts.json) and [still life](../assets/examples/natural-sources/still-life-prompts.json). The guitar record includes its targeted closer-framing edit. Change one concrete problem at a time when retrying; choose a different concept when the geometry remains awkward.

## Accept or reject in the browser

1. **Inspect the untouched source.** It must be an ordinary single scene without generated recursion. Check physical plausibility, the target's actual size and edge margins, and the complete rim. A beautiful source can still be unsuitable.
2. **Fit the nest to the actual pixels.** Select the interior up to its rim, preserving the rim outside it. Choose rectangle or ellipse to match. Do not reuse approximate prompt coordinates without inspection. Check the resulting working crop keeps the important subject and context.
3. **Pause at Droste.** Inspect the first inserted copy at useful magnification. It should sit naturally in the target, without a leftover roof tip, partial second frame, stray strip of old interior or visibly mismatched boundary. Normal watch hands, a record spindle or guitar strings are not automatic rejections, but inspect where they meet the replacement.
4. **Play a full zoom cycle.** Follow a recognizable detail near the edge as well as one near the center. The entire working frame must move. Watch the loop wrap and the copy boundaries at several scales, not only the attractive starting frame.
5. **Scrub and play Droste → tententoon.** Check intermediate states and the final spiral. The zoom phase should carry through. Judge whether the rim, colors and surrounding forms make a legible, appealing spiral; don't accept an image solely because it renders without an error. Distinguish a misfit nest from an artifact shared by the renderer across images.
6. **Check the intended viewing sizes.** Review the actual gallery page, including fullscreen and a phone-sized layout. A small copy must remain discoverable and the framing should retain its subject. Keep only images whose source, repetition and spiral all earn their place.

If a join fails, adjust the nest or regenerate the source. Do not freeze the outer source behind an aperture-only animated mask to conceal it: that produced the “zooms only inside” bug and broke the transition. The current renderer covers and animates the whole working frame. For elliptical repetition, the larger outer rim is also part of the repeated image.

Browser pixel audits can detect transparent gaps or a stationary periphery, but cannot establish coherent geometry or good composition. They support visual review. The [gallery smoke checks](../scripts/gallery-smoke.mjs) include a regression against a frozen composited periphery; [tour checks](../scripts/gallery-tour-smoke.mjs) watch a complete automatic cycle. See [gallery validation instructions](../src/lib/gallery/README.md) for how to run them. Collection counts and expected IDs in those scripts need updating when the sample collection changes.

## Preserve and integrate an accepted source

Save the approved original PNG in `assets/examples/natural-sources/` with a descriptive name. Keep rejected image files outside that folder: the encoder reads every PNG in it. Preserve the exact final prompt, any edit prompts and references, generator used, generated original path, and why attempts were accepted or rejected. A local saved original must remain available even if a generation-session path disappears.

Give each accepted image a unique, stable ID. Add the final calibrated nest, shape, source, thumbnail, title, description and accurate alt text to [the collection manifest](../src/gallery/collection.ts). Store coordinates as fractions of the uncropped source; the renderer computes the working crop. Keep these final values distinct from requested or estimated generation geometry.

Run `python3 scripts/prepare-gallery-images.py` from the repository root to create the display WebP and thumbnail as `public/gallery-images/natural-NAME.webp` and `natural-NAME-thumb.webp`. This resizes and encodes the image without adding recursion. Retain generated-image provenance and do not describe generated scenes as photographs of actual people or places. Finally, verify the encoded assets through the gallery, using the browser review above.

The aim is a strong collection, not rescuing every concept. The earlier recursive coast, greenhouse and fantasy studies are useful records of exploration; they are not templates for generating the next ordinary source.
