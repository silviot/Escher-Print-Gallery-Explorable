I wish to build a beautiful html explorable with svelte.
It should take an image from the user and help them add a Droste effect. User should identify a rectangle inside the image where it will repeat itself.
Then we should show them the log of the image. And let them rotate it to then show the exponentiated version of the rotated log image.

Plan as much as you can

16:52

Searched memory
Searched memory
Great — the project notes give me a solid foundation. Your ask is a tighter, more user-driven slice of the bigger architecture: the user supplies the image and the self-similar inset, and the explorable walks them through log → rotate → exp. Here's a thorough plan.

What the user sees, step by step
1. Upload. Drop zone or file picker. We keep a plain HTMLImageElement around, plus decode it into an ImageBitmap for fast texture upload and a Canvas2D render for the picker overlay.

2. Place the self-similar rectangle. The image displays on a canvas. A draggable, resizable rectangle sits on top. Two constraints:

Its aspect ratio is locked to the image's aspect ratio (otherwise the self-similarity isn't a pure complex-plane scaling — it'd be anisotropic and the log/exp story falls apart).
Its position and size define two things the math needs: the limit point (where the infinite zoom converges) and the scale factor S.
For a rectangle with top-left (x₀, y₀) and width w in an image of width W, S = W / w, and the limit point is the fixed point of the "shrink image into rectangle" map: c = (x₀·S/(S−1), y₀·S/(S−1)). I'll show a small crosshair at c so the user can see it move as they drag.

3. Log view. Once the rectangle is placed, a second panel appears showing log(w) of the image with the limit point placed at the origin. It's a horizontally-repeating strip, 2π tall vertically, with a visible "fundamental domain" rectangle of width log S and height 2π. This is the panel that makes people's jaws drop — it's worth annotating heavily.

4. Rotation control. A slider (0° → the "Escher angle") plus a draggable complex-number handle in a tiny α-plane widget. The log view re-renders live as they rotate, so they see the tiling pattern pivot around the chosen pivot point z₀.

5. Exp view. The third panel shows exp(α·log(w)) — the final Droste-twist composition. At α = 1 it's the original image; at α = (2πi + log S)/(2πi) it's the Escher effect; in between it's a continuous morph.

Ideally all three panels are linked: hovering a point in one highlights its counterpart in the others.

The math, made concrete for this flow
Given the user's rectangle, we compute once:

S       = W / w_inner                    (real scale factor)
c       = fixed point of shrink map       (limit point, in image pixels)
α_escher = (2πi + log S) / (2πi)          (the "correct" complex exponent)
The user's rotation parameter is a complex number α. We parameterize it as an interpolation so they get a clean slider:

α(t) = (1 − t) · 1  +  t · α_escher     for t ∈ [0, 1]
With optional free-form control via drag in the α-plane. The three passes, all as fragment shaders doing inverse mapping:

Source view: sample the image directly.
Log view: for each output pixel with complex coordinate z, compute w = exp(z), then sample the image at w (translated back from the limit-point-centered frame into image pixel coords). Outside the image, fold horizontally by log S to show the periodic tiling.
Exp view: for each output pixel w_out, compute z_out = log(w_out), then z_src = α⁻¹ · (z_out − z₀) + z₀, then w_src = exp(z_src), then sample.
Inverse mapping is non-negotiable here — forward warping leaves holes and destroys antialiasing.

Svelte architecture
Svelte 5 (runes) + Vite. Keep it dependency-light. No SvelteKit needed — a single-page Vite app is simpler and ships smaller.

src/
  lib/
    math/
      complex.ts          // cmul, cdiv, clog, cexp, cpow
      droste.ts           // derive S, c, α_escher from a rectangle
    gl/
      renderer.ts         // WebGL2 context, program cache, fullscreen quad
      shaders/
        common.glsl       // complex helpers used by all passes
        source.frag
        logView.frag
        expView.frag
    stores/
      image.svelte.ts     // $state for source ImageBitmap + texture
      selection.svelte.ts // $state for rectangle + derived S, c, α_escher
      transform.svelte.ts // $state for α (user's rotation/scale)
  components/
    Uploader.svelte
    SourcePanel.svelte        // canvas + rectangle picker overlay
    RectanglePicker.svelte    // drag/resize handles, aspect-locked
    LogPanel.svelte           // WebGL canvas
    ExpPanel.svelte           // WebGL canvas
    AlphaControl.svelte       // slider + draggable α in its own plane
    Annotations.svelte        // SVG overlay for labels/arrows
  App.svelte
A few principles worth committing to up front:

All three view panels share one WebGL2 context and one source texture. Multiple contexts on one page is painful and wastes GPU memory.
Complex math has a TypeScript implementation and a GLSL implementation, and they must agree. CPU-side is used for annotations, hover linking, and unit tests; GPU-side is used for the actual rendering.
Rectangle state is the source of truth. S, c, and α_escher are derived reactively, never stored.
The rectangle picker, in detail
This is the single most UX-sensitive part. Things I want to get right:

Eight handles (four corners, four edges), but corner-drag scales uniformly around the opposite corner (aspect-locked). Edge-drag on the locked axis is disabled or snapped; edge-drag on the free axis scales uniformly too. Simplest: only corner handles, plus a body-drag to translate.
A minimum size constraint (S can't exceed, say, 100 in practice — numerical precision degrades).
A subtle glyph at the limit point c, and a second glyph showing where the rectangle "would sit" one level deeper (so users can see the nesting structure).
Live display of S as a number next to the panel.
Optional "snap to center" so the user can quickly place a centered rectangle if they want a symmetric case.
The log view shader, sketched
glsl
// inputs: iSourceTex, iLimitPoint (vec2, in image-pixel coords),
//         iImageSize (vec2), iLogS (float), iCanvasAspect (float)

// z-plane viewport: we show Re(z) ∈ [-k·logS, k·logS], Im(z) ∈ [-π, π]
vec2 z = vec2(
  mix(-4.0 * iLogS, 4.0 * iLogS, vUv.x),
  mix(-PI, PI, vUv.y)
);

vec2 w = cexp(z);  // in the limit-point-centered, normalized frame

// convert back to image-pixel coords
vec2 srcPx = iLimitPoint + w * iNormalizationScale;

vec2 uv = srcPx / iImageSize;
if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
  // outside image: fold by log S horizontally, show periodic repeat
  // ... or black, controlled by a uniform
}
fragColor = texture(iSourceTex, uv);
The exp view is symmetric: shader takes w_out, inverts α, takes log, rotates, exps, samples.

The α control widget
A small secondary canvas (maybe 150×150 px) showing a complex plane with α = 1 and α = α_escher marked. The user drags a dot. We show α's value in Cartesian and polar forms. The slider is really just a parameterization of the line segment between 1 and α_escher — good for first-time users. The draggable dot is for "kaleidoscopic exploration" mode, which matches what the 3b1b video shows as the payoff.

Things I want you to decide before I build
Scope of the rectangle picker. Just corner-drag + body-drag, or full eight-handle? I'd start minimal.
How do we handle the "outside the image" region in the log view? Options: (a) black, (b) periodic tiling using the image itself (looks wrong unless the image really is Droste), (c) a checker/grid to make periodicity obvious pedagogically. I'd lean (c) with a toggle to (a).
Do you want the three panels side-by-side, or a stepped single-panel walkthrough? The explorable case is strongest with all three visible at once (users can see cause and effect). Mobile might force a stepped layout.
Interactive linking. Hover-in-one-highlights-in-others is the gold standard but adds real complexity. Worth it?
Svelte 4 or Svelte 5? I assumed 5 with runes. Happy to use 4 if your tooling is pinned.
Any aesthetic direction? The "beautiful" in your ask is doing a lot of work. Dark academic (thin serifs, warm ink), clean math-paper (Computer Modern, lots of whitespace), or something closer to the 3b1b video's teal/tan palette?
Suggested build order
Stage 1: scaffolding + image upload + source display with a draggable aspect-locked rectangle, showing live S and c. No math yet. Stage 2: WebGL2 renderer plumbing, one fullscreen-quad program, source-view pass as a sanity check. Stage 3: log-view shader with the periodic tiling and the fundamental-domain overlay. Stage 4: α-control widget + exp-view shader, driven by the same α state. Stage 5: annotations, hover-linking, polish.

Tell me which of the open decisions you want to resolve (or skip) and I'll start on Stage 1.

I think first the creation of a Droste Image needs to be nailed down UI wise.
Four points (plus a draggable rectangle) work.
Question 2 answer is that we will always have a Droste Image since we constructed it with the user positioning the Droste Point.
Question: how about an image with the repeating Droste rectangle far from the center? How big of a problem will it be?

Panels should all be visible at once on desktop, but on mobile I think we will necessarily show a single one.

4 is worth is, but in a second pass after all the rest is nailed down. Unless it helps with debuggeing, which it might

Svelte 5. Runes rule!

Let's go with the 3b1b aesthetic!

Show more
18:13
Off-center Droste rectangle. Mathematically fine — the log/exp pipeline doesn't care where c lands. Three practical issues:

The final Escher spiral always converges on c. Off-center → spiral tucked in a corner, which can look deliberate or accidental. Users need to see this before committing.
If c falls outside the image entirely, the "interesting central region" of the log view has no real pixels. The pattern still renders, but the payoff is visually elsewhere.
More of the visible area samples outside the source, so we need graceful handling (checker background or periodic tiling toggle).
Mitigation: always draw c as a visible crosshair. When it's outside the image bounds, render an edge indicator — arrow at the nearest image edge, numeric offset. Users immediately grasp the geometry. Offer a "center the rectangle" escape hatch.

The four-corners + body-drag picker.

Hard rules:

Aspect ratio locked to source image aspect. No escape. Dragging a corner scales uniformly about the opposite corner. Body-drag translates. Period.
Enforce a max S around 25–30. Past that, numerical precision eats us.
Minimum touch target 44px, handles visually 8px resting / 12px hovered.
Live feedback in the picker:

Crisp teal outline on the inner rectangle, 1.5px hairline.
One or two ghost rectangles showing the next nesting levels, fading out. This is where users feel the Droste click.
Tiny chip near the rect: S = 12.3   log S = 2.51.
Limit point c: small animated crosshair. Label updates live.
When c goes off-image: arrow indicator at the edge with numeric offset.
3b1b aesthetic, committed:

Palette (Manim colors, lifted directly):

Background 
#101820
Foreground 
#ECE6D1 (cream)
Primary accent (math, handles, active) 
#58C4DD (teal)
Warm accent 
#FFB85C
Grid/guide green 
#83C167
Muted border 
#4A5568
Type:

UI body: EB Garamond or Crimson Pro (free, mathematical-paper feel)
Math: KaTeX
Numbers/code: JetBrains Mono
Motion:

Easing cubic-bezier(0.4, 0, 0.2, 1), Manim-smooth
No drop shadows. Flat layering. Generous whitespace.
Direct (unlagged) drag, 200ms ease-out on release.
Build proposal — Stage 1. Single-page Svelte 5 + Vite app. Image uploader, source canvas with the full picker described above, c crosshair, ghost nesting, live readouts, color/type system in place. No WebGL yet — pure DOM/SVG + Canvas2D for the source. That isolates the picker UX so we can nail it before touching shaders.

Want me to build it?
