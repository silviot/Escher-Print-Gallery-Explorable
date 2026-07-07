/**
 * Sampling helpers for the Droste visualisation pipeline.
 *
 * Every panel renders by an INVERSE map: for each output pixel we ask
 * "what point in the source did this come from?", then bilinearly sample
 * the source there. This guarantees every output pixel is covered (a
 * forward map would leave holes wherever the forward map stretched).
 *
 * The pipeline stages, all rendered this way:
 *
 *   1. log(z − c)              — log panel
 *   2. rotate (u, v) by atan(logS / 2π) — rotated-log panel
 *   3. (z − c)^α  with α = 1 − i·logS/(2π) — Escher panel
 *
 * The rotated-log panel is illustrative: it's a PURE rotation of log
 * space, not the full multiplication by 2πi/(logS + 2πi) the Lenstra
 * construction needs. Applying exp to it won't quite match the Escher
 * panel (the rotation is right but a scale factor is missing). Showing
 * the three side by side still makes the geometry obvious.
 *
 * The source image is, of course, NOT actually Droste-invariant — it's
 * just a photo. We FAKE invariance with `sampleDroste`, which folds any
 * candidate sample point back into the outermost ring of the image by
 * scaling around c. The result is what the picture would look like if it
 * really were a Droste fractal.
 */

export type Pixels = ImageData;

/** Bilinear sample of the source at (x, y) in pixel space. Out-of-bounds → transparent black. */
export function sample(
  src: Pixels,
  x: number,
  y: number,
  out: [number, number, number, number]
): void {
  const W = src.width;
  const H = src.height;
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    return;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = src.data;
  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  out[0] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
  out[1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
  out[2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
  out[3] = d[i00 + 3] * w00 + d[i10 + 3] * w10 + d[i01 + 3] * w01 + d[i11 + 3] * w11;
}

/**
 * Render `out` by inverse mapping. For each output pixel (px, py), the
 * caller's `mapInv` writes the corresponding source coord into `s`; we
 * sample the source there. Returning false leaves the output pixel blank.
 */
export function renderMapped(
  out: ImageData,
  pixels: Pixels,
  mapInv: (px: number, py: number, src: { x: number; y: number }) => boolean
): void {
  const rgba: [number, number, number, number] = [0, 0, 0, 0];
  const src = { x: 0, y: 0 };
  const W = out.width;
  const H = out.height;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      if (mapInv(px, py, src)) {
        sample(pixels, src.x, src.y, rgba);
        out.data[idx] = rgba[0];
        out.data[idx + 1] = rgba[1];
        out.data[idx + 2] = rgba[2];
        out.data[idx + 3] = rgba[3];
      } else {
        out.data[idx] = 0;
        out.data[idx + 1] = 0;
        out.data[idx + 2] = 0;
        out.data[idx + 3] = 0;
      }
    }
  }
}

/**
 * Droste self-similarity context: we PRETEND the working image is invariant
 * under p → c + S·(p − c), scaling by S around c. The working image is the
 * user's CROP of the original — when the crop covers the whole image,
 * "working coords" and "original coords" coincide, but in general working
 * coords run [0, W)×[0, H) while the original lives at an offset.
 *
 *   cx, cy   — limit point in working (crop-relative) coords
 *   W, H     — working image dimensions (= crop size)
 *   cropX,   — where the crop sits inside the original; sample positions
 *   cropY      get translated by (+cropX, +cropY) before reading pixels
 */
export type DrosteCtx = {
  cx: number;
  cy: number;
  logS: number;
  rMax: number;
  W: number;
  H: number;
  cropX: number;
  cropY: number;
  /**
   * Multiplier applied to the final coords just before reading pixels.
   * 1 for the regular source. > 1 lets the caller pass an upscaled
   * image (e.g. 4× from fal.ai) while keeping all the geometry math in
   * original-image coords — the caller swaps `pixels` and bumps
   * `sampleScale` together.
   */
  sampleScale: number;
  /**
   * Frame-shape morph picking the fold's fundamental domain — i.e. WHICH
   * self-similar plane we fake. 0 = ellipse inscribed in the working rect
   * (plane tiled by elliptical rings, using only the content between the
   * crop-inscribed ellipse and the selection ellipse); 1 = the working
   * rectangle itself (classic nested rectangular copies). Values in between
   * blend the L2 and L∞ gauges (see ../ui1/shape.ts) so the plane morphs
   * continuously. Optional; omitted = 1 (rectangle) for backward compat.
   */
  shapeMorph?: number;
};

/**
 * Sample the (faked) Droste tiling. The candidate (sx, sy) is in working
 * coords. We scale (sx − c, sy − c) by S^n until the result lands inside
 * the fold's fundamental domain, then translate to original-image coords
 * for the actual bilinear read. Among valid n we pick the one with the
 * largest radius — the outermost, sharpest equivalent copy.
 *
 * Fundamental domain by ctx.shapeMorph (0 = ellipse, 1 = rect; blend
 * between). The domain is the gauge ball {(1−m)‖v‖₂ + m‖v‖∞ ≤ 1} of
 * v = ((tx−ex)/ex, (ty−ey)/ey), inscribed in [0, W-1]×[0, H-1]. At m = 1
 * this is exactly the rect test tx∈[0,W-1], ty∈[0,H-1]; at m = 0 the
 * inscribed ellipse. Scanning n from large to small, the FIRST hit inside
 * the ball is automatically outside its one-step-smaller copy f(ball) —
 * the gauge is degree-1 homogeneous, so this holds at every m — hence the
 * fold yields exactly the fundamental annulus, tiling the plane with the
 * chosen shape.
 */
export function sampleDroste(
  src: Pixels,
  ctx: DrosteCtx,
  sx: number,
  sy: number,
  out: [number, number, number, number]
): boolean {
  const dx = sx - ctx.cx;
  const dy = sy - ctx.cy;
  const r = Math.hypot(dx, dy);
  if (r < 1e-9) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    return false;
  }
  const m = ctx.shapeMorph ?? 1;
  // Gauge ball inscribed in [0, W-1]×[0, H-1] (m=1 ⇒ that exact rect).
  const ex = (ctx.W - 1) / 2;
  const ey = (ctx.H - 1) / 2;
  // Largest n with r·exp(n·logS) ≤ rMax. Walk inward from there until the
  // scaled point lands inside the fundamental domain. The 10-step cap is
  // generous: dn > 1 only kicks in when one working dimension is much
  // shorter than the other, so the inner ring spills outside it. Falling
  // off the cap leaves the pixel transparent (the only reasonable thing).
  const n0 = Math.floor((Math.log(ctx.rMax) - Math.log(r)) / ctx.logS);
  for (let dn = 0; dn <= 10; dn++) {
    const n = n0 - dn;
    const scale = Math.exp(n * ctx.logS);
    const tx = ctx.cx + dx * scale;
    const ty = ctx.cy + dy * scale;
    const nx = (tx - ex) / ex;
    const ny = (ty - ey) / ey;
    const inside = (1 - m) * Math.hypot(nx, ny) + m * Math.max(Math.abs(nx), Math.abs(ny)) <= 1;
    if (inside) {
      const ss = ctx.sampleScale;
      sample(src, (tx + ctx.cropX) * ss, (ty + ctx.cropY) * ss, out);
      return true;
    }
  }
  return false;
}

/**
 * Sub-pixel offsets for adaptive supersampling, in CANVAS-pixel units.
 *
 * Three tiers: 1, 4, 16 samples per output pixel. The 4- and 16-tap
 * patterns are regular grids placed at cell centres so the average is
 * unbiased. Pixels far from c stay at 1×; pixels where the local
 * Jacobian × Droste fold blows the source-per-output-pixel ratio above
 * one need 4× or 16× to integrate that footprint correctly. Higher
 * tiers would help even further, but 16 is enough to stop the visible
 * staircasing in practice and we don't want to pay for it everywhere.
 */
export const SS_OFFSETS_4: readonly (readonly [number, number])[] = [
  [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]
];
export const SS_OFFSETS_16: readonly (readonly [number, number])[] = (() => {
  const o: [number, number][] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      o.push([(i + 0.5) / 4 - 0.5, (j + 0.5) / 4 - 0.5]);
    }
  }
  return o;
})();

/**
 * Pick a supersampling tier from a footprint estimate F = source-pixels per
 * output-canvas-pixel. F ≤ 1 needs no SS; F² samples is the standard rule
 * for an isotropic square footprint. We round up to the next available
 * tier (1, 4, 16) and cap at 16.
 */
export function ssOffsetsForFootprint(footprint: number): readonly (readonly [number, number])[] | null {
  const fp2 = footprint * footprint;
  if (fp2 <= 1) return null;
  if (fp2 <= 4) return SS_OFFSETS_4;
  return SS_OFFSETS_16;
}

/** Like `renderMapped`, but routes every source lookup through Droste folding. */
export function renderMappedDroste(
  out: ImageData,
  pixels: Pixels,
  ctx: DrosteCtx,
  mapInv: (px: number, py: number, src: { x: number; y: number }) => boolean
): void {
  const rgba: [number, number, number, number] = [0, 0, 0, 0];
  const src = { x: 0, y: 0 };
  const W = out.width;
  const H = out.height;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      if (mapInv(px, py, src) && sampleDroste(pixels, ctx, src.x, src.y, rgba)) {
        out.data[idx] = rgba[0];
        out.data[idx + 1] = rgba[1];
        out.data[idx + 2] = rgba[2];
        out.data[idx + 3] = rgba[3];
      } else {
        out.data[idx] = 0;
        out.data[idx + 1] = 0;
        out.data[idx + 2] = 0;
        out.data[idx + 3] = 0;
      }
    }
  }
}

