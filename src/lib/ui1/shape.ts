/**
 * Morphable frame shape, shared by the fold math, the GPU shaders, the
 * nested-Droste clips, and the editor overlay so they all agree.
 *
 * The shape is a blend of two degree-1 homogeneous gauges of the
 * normalised offset v = (dx/a, dy/b):
 *
 *   ellipse (m = 0):  ‖v‖₂ = hypot(vx, vy)        ≤ 1
 *   rectangle (m = 1): ‖v‖∞ = max(|vx|, |vy|)     ≤ 1
 *   morph:            (1−m)·‖v‖₂ + m·‖v‖∞          ≤ 1
 *
 * m ∈ [0, 1] interpolates a circle/ellipse into a rectangle. Because both
 * gauges (and hence the blend) are positively homogeneous of degree 1, the
 * Droste fold's fundamental-domain property holds at EVERY m — so the whole
 * self-similar plane (spiral, rings, pipeline) can morph continuously, not
 * just the outline. See sampleDroste in ../math/transforms.ts.
 */

/** Blend gauge of a unit direction (cos, sin). Used to trace the boundary. */
export function dirGauge(cos: number, sin: number, m: number): number {
  return (1 - m) + m * Math.max(Math.abs(cos), Math.abs(sin));
}

/**
 * Inside test in normalised coords (nx = dx/a, ny = dy/b). m: 0 = ellipse,
 * 1 = rectangle. Mirrors the fold's inside test and the shaders exactly.
 */
export function insideGauge(nx: number, ny: number, m: number): boolean {
  return (1 - m) * Math.hypot(nx, ny) + m * Math.max(Math.abs(nx), Math.abs(ny)) <= 1;
}

/**
 * Boundary points of the morph shape inscribed in the axis-aligned box
 * centred at (cx, cy) with half-extents (a, b). m: 0 = ellipse → 1 = rect.
 *
 * `steps` is a multiple of 8 so the four corner directions (±45°) are
 * sampled exactly — at m = 1 those points ARE the rectangle corners, so the
 * polygon is a crisp rectangle; at m = 0 it is a smooth ellipse.
 */
export function shapeBoundary(
  cx: number,
  cy: number,
  a: number,
  b: number,
  m: number,
  steps = 96
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const phi = (i / steps) * Math.PI * 2;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const rho = 1 / dirGauge(c, s, m);
    pts.push([cx + a * rho * c, cy + b * rho * s]);
  }
  return pts;
}

/** SVG path `d` for a closed boundary. */
export function pathD(pts: ReadonlyArray<readonly [number, number]>): string {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    d += (i === 0 ? 'M' : 'L') + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2);
  }
  return d + 'Z';
}

/** Build a Path2D for the morph shape inscribed in (cx±a, cy±b). */
export function shapePath2D(cx: number, cy: number, a: number, b: number, m: number): Path2D {
  const pts = shapeBoundary(cx, cy, a, b, m);
  const p = new Path2D();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) p.moveTo(pts[i][0], pts[i][1]);
    else p.lineTo(pts[i][0], pts[i][1]);
  }
  p.closePath();
  return p;
}
