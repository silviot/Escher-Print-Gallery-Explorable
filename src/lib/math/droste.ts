export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type DrosteGeometry = {
  S: number;
  logS: number;
  limit: Point;
  alphaEscher: { re: number; im: number };
};

/**
 * For an image of size (W, H) with an inner self-similar rectangle (x, y, w, h),
 * the shrink map f(p) = rect.topLeft + p / S has a unique fixed point (limit point).
 * c = x · S / (S - 1),  S = W / w
 */
export function drosteGeometry(
  image: { width: number; height: number },
  rect: Rect
): DrosteGeometry {
  const S = image.width / rect.w;
  const logS = Math.log(S);
  const k = S / (S - 1);
  const limit: Point = { x: rect.x * k, y: rect.y * k };
  const twoPi = 2 * Math.PI;
  const denom = twoPi * twoPi;
  const alphaEscher = {
    re: (twoPi * twoPi) / denom,
    im: (twoPi * logS) / denom
  };
  return { S, logS, limit, alphaEscher };
}

/** Clamp a rectangle (aspect-locked to image aspect) so it stays inside the image. */
export function clampRect(
  image: { width: number; height: number },
  rect: Rect,
  minSFactor = 1.05,
  maxS = 30
): Rect {
  const aspect = image.width / image.height;
  const minW = image.width / maxS;
  const maxW = image.width / minSFactor;
  let w = Math.max(minW, Math.min(maxW, rect.w));
  let h = w / aspect;
  const x = Math.max(0, Math.min(image.width - w, rect.x));
  const y = Math.max(0, Math.min(image.height - h, rect.y));
  return { x, y, w, h };
}
