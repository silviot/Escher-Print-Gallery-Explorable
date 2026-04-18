/**
 * Pure sampling helpers for the Droste pipeline visualisation.
 *
 * Pipeline stages (all sampled by inverting the forward map in each output
 * pixel, so that every output pixel gets filled regardless of how the source
 * folds onto itself):
 *
 *   1. log(z - c)              → log panel
 *   2. rotate log by angle a   → rotated-log panel  (a = atan(logS / 2π))
 *   3. complex-power (z-c)^α   → Escher panel        (α = 1 - i·logS/2π)
 *
 * The rotated-log panel is a pure rotation in log-space — applying exp to it
 * won't perfectly match the Escher panel (which also picks up a scale factor
 * |α|), but the three together make the geometry obvious.
 */

export type Pixels = ImageData;

/** Bilinear sample. Returns the RGBA channels (0..255) at (x, y) in pixel space. */
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
 * Fill a (w×h) output buffer by applying `mapInv` to each output pixel: the
 * function receives (px, py) in output-canvas pixel coords and writes the
 * corresponding source image coord into `src`. Skip writing `src` (return
 * false) to leave that output pixel black/transparent.
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
 * Droste self-similarity context: image is assumed invariant under
 * p → c + S·(p − c), i.e. scaling by S around the limit point c.
 */
export type DrosteCtx = {
  cx: number;
  cy: number;
  logS: number;
  /** Largest radius from c that we will accept as "inside the image"; use max corner distance. */
  rMax: number;
};

/**
 * Droste-wrapped sampling. Given a candidate source point (sx, sy) — which may
 * be outside the image, or so close to c that the image is just a blur — scale
 * (sx − c, sy − c) by S^n (n ∈ Z) until the resulting point is inside the image.
 * Among valid n we pick the one giving the largest radius, so every output
 * pixel draws from the richest, outermost equivalent copy.
 */
export function sampleDroste(
  src: Pixels,
  ctx: DrosteCtx,
  sx: number,
  sy: number,
  out: [number, number, number, number]
): boolean {
  const W = src.width;
  const H = src.height;
  const dx = sx - ctx.cx;
  const dy = sy - ctx.cy;
  const r = Math.hypot(dx, dy);
  if (r < 1e-9) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    return false;
  }
  // Largest n such that r·exp(n·logS) ≤ rMax; start there and walk inward.
  const n0 = Math.floor((Math.log(ctx.rMax) - Math.log(r)) / ctx.logS);
  for (let dn = 0; dn <= 10; dn++) {
    const n = n0 - dn;
    const scale = Math.exp(n * ctx.logS);
    const tx = ctx.cx + dx * scale;
    const ty = ctx.cy + dy * scale;
    if (tx >= 0 && ty >= 0 && tx <= W - 1 && ty <= H - 1) {
      sample(src, tx, ty, out);
      return true;
    }
  }
  return false;
}

/** Like renderMapped, but samples through sampleDroste so the infinite tiling fills every output pixel. */
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

/** Largest |corner − c| for the given image size — used as rMax in Droste wrap. */
export function maxCornerRadius(
  imageWidth: number,
  imageHeight: number,
  cx: number,
  cy: number
): number {
  let maxR = 0;
  const corners: Array<[number, number]> = [
    [0, 0],
    [imageWidth, 0],
    [0, imageHeight],
    [imageWidth, imageHeight]
  ];
  for (const [x, y] of corners) {
    const r = Math.hypot(x - cx, y - cy);
    if (r > maxR) maxR = r;
  }
  return maxR;
}
