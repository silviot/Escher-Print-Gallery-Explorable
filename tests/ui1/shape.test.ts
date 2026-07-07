import { describe, expect, it } from 'vitest';
import { dirGauge, insideGauge, shapeBoundary } from '../../src/lib/ui1/shape';

/**
 * The morph shape blends the L2 (ellipse) and L∞ (rect) gauges. These pin the
 * two endpoints and the monotone in-between so the circle→rectangle animation
 * is geometrically what we claim.
 */
describe('morph shape geometry', () => {
  it('inside test: m=0 is the ellipse, m=1 is the rectangle', () => {
    // The rect corner (1,1) is inside the unit square (m=1) but outside the
    // unit circle (m=0).
    expect(insideGauge(1, 1, 1)).toBe(true); // rectangle contains its corner
    expect(insideGauge(1, 1, 0)).toBe(false); // ellipse does not
    // Axis points are on the boundary of both.
    expect(insideGauge(1, 0, 0)).toBe(true);
    expect(insideGauge(1, 0, 1)).toBe(true);
  });

  it('corner inclusion grows monotonically with m', () => {
    // Gauge of the 45° corner direction: 1/gauge is how far the boundary
    // reaches. At m=0 it reaches √2·(a,b)?? No — the ellipse reaches 1 in
    // normalised coords; the rectangle reaches √2. So the corner distance
    // grows with m. dirGauge returns the gauge of a UNIT direction.
    const g0 = dirGauge(Math.SQRT1_2, Math.SQRT1_2, 0); // ellipse: 1
    const gh = dirGauge(Math.SQRT1_2, Math.SQRT1_2, 0.5);
    const g1 = dirGauge(Math.SQRT1_2, Math.SQRT1_2, 1); // rect: 1/√2
    expect(g0).toBeCloseTo(1, 6);
    expect(g1).toBeCloseTo(Math.SQRT1_2, 6);
    expect(gh).toBeGreaterThan(g1);
    expect(gh).toBeLessThan(g0); // strictly between → reach grows as m rises
  });

  it('boundary endpoints: crisp rectangle at m=1, smooth ellipse at m=0', () => {
    // Box centred at (100,100), half-extents (60,40). 96 steps → 45° sampled.
    const rect = shapeBoundary(100, 100, 60, 40, 1);
    // The 45° sample (index 12 of 96) is the rectangle corner (160,140).
    expect(rect[12][0]).toBeCloseTo(160, 3);
    expect(rect[12][1]).toBeCloseTo(140, 3);
    // Every rect boundary point stays within the box (± tiny fp).
    for (const [x, y] of rect) {
      expect(x).toBeLessThanOrEqual(160 + 1e-6);
      expect(x).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(y).toBeLessThanOrEqual(140 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(60 - 1e-6);
    }
    const ell = shapeBoundary(100, 100, 60, 40, 0);
    // The 45° sample of the ellipse sits at (100+60/√2, 100+40/√2), well
    // inside the box corner — the ellipse cuts the corner off.
    expect(ell[12][0]).toBeCloseTo(100 + 60 * Math.SQRT1_2, 3);
    expect(ell[12][1]).toBeCloseTo(100 + 40 * Math.SQRT1_2, 3);
  });

  it('a midpoint morph is strictly between ellipse and rectangle at the corner', () => {
    const ellC = shapeBoundary(0, 0, 1, 1, 0)[12][0];
    const midC = shapeBoundary(0, 0, 1, 1, 0.5)[12][0];
    const rectC = shapeBoundary(0, 0, 1, 1, 1)[12][0];
    expect(midC).toBeGreaterThan(ellC);
    expect(midC).toBeLessThan(rectC);
  });
});
