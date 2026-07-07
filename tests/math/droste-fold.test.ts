import { describe, expect, it } from 'vitest';
import { sampleDroste, type DrosteCtx } from '../../src/lib/math/transforms';

/**
 * The fold's fundamental domain follows ctx.shape:
 *   rect    — working rectangle [0, W-1]×[0, H-1]
 *   ellipse — ellipse E₀ inscribed in it (first hit in E₀ lands in the
 *             fundamental annulus E₀ \ f(E₀) automatically)
 * We use a coordinate-gradient image so the sampled colour reveals WHERE
 * the fold landed: red ≈ x, green ≈ y.
 */

const W = 100;
const H = 100;

function gradientPixels(): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data } as ImageData;
}

function ctx(shape?: 'rect' | 'ellipse'): DrosteCtx {
  return {
    cx: 50,
    cy: 50,
    logS: Math.log(2),
    rMax: Math.hypot(50, 50),
    W,
    H,
    cropX: 0,
    cropY: 0,
    sampleScale: 1,
    shape
  };
}

describe('sampleDroste fold domain', () => {
  const pixels = gradientPixels();
  // A point toward the corner, radius 60 at 45°: inside the working rect
  // but OUTSIDE the inscribed ellipse E₀ (centre (49.5, 49.5), radius 49.5).
  const px = 50 + 60 * Math.SQRT1_2; // ≈ 92.43
  const py = 50 + 60 * Math.SQRT1_2;

  it('rect mode samples the corner region directly', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    expect(sampleDroste(pixels, ctx('rect'), px, py, out)).toBe(true);
    expect(out[0]).toBeCloseTo(px, 0); // red ≈ x → landed at the point itself
    expect(out[1]).toBeCloseTo(py, 0);
  });

  it('shape omitted behaves as rect (backward compat)', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    expect(sampleDroste(pixels, ctx(), px, py, out)).toBe(true);
    expect(out[0]).toBeCloseTo(px, 0);
  });

  it('ellipse mode folds the corner point one step inward, into the ring', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    expect(sampleDroste(pixels, ctx('ellipse'), px, py, out)).toBe(true);
    // One fold step (×1/2 around c = (50,50)): 50 + (px − 50)/2 ≈ 71.21.
    const expected = 50 + (px - 50) / 2;
    expect(out[0]).toBeCloseTo(expected, 0);
    expect(out[1]).toBeCloseTo(expected, 0);
    // … which lands inside E₀ (centre (49.5, 49.5), radius 49.5).
    const e0 = ((expected - 49.5) / 49.5) ** 2 * 2;
    expect(e0).toBeLessThanOrEqual(1);
  });

  it('ellipse mode folds an inner point outward into the fundamental annulus', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    // Radius 10 at 45° — deep inside the nested copies.
    const ix = 50 + 10 * Math.SQRT1_2;
    const iy = 50 + 10 * Math.SQRT1_2;
    expect(sampleDroste(pixels, ctx('ellipse'), ix, iy, out)).toBe(true);
    // n0 = floor((ln rMax − ln 10)/ln 2) = 2 → scale ×4 → radius 40.
    const expected = 50 + (ix - 50) * 4;
    expect(out[0]).toBeCloseTo(expected, 0);
    // The landing point is inside E₀ but outside E₁ = f(E₀)
    // (centre (49.75, 49.75), radii 24.75) — i.e. in the annulus.
    const e1 = ((expected - 49.75) / 24.75) ** 2 * 2;
    expect(e1).toBeGreaterThan(1);
  });
});
