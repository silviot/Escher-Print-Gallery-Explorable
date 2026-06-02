/**
 * CPU fallback for the complex playground — the no-WebGL2 path. Mirrors
 * shader.frag.glsl using the presets' JS `f` (kept in lockstep). No mipmaps,
 * so this is a plain bilinear sample at a capped resolution; correctness over
 * polish, since it only runs where WebGL2 is unavailable.
 */

import { cadd, cx, type Complex, type FillMode, type PanMode, type Params, type Preset } from './presets';

export type PlaygroundCpuInput = {
  pixels: ImageData;
  preset: Preset;
  params: Params;
  W: number;
  H: number;
  imgAspect: number;
  zoom: number;
  c: Complex;
  panMode: PanMode;
  fill: FillMode;
};

/** Wrap a normalized coord into [0,1) per fill mode. */
function wrap1(t: number, fill: FillMode): number {
  if (fill === 'tile') return t - Math.floor(t);
  if (fill === 'clamp') return t < 0 ? 0 : t > 1 ? 1 : t;
  const m = Math.abs(t) % 2; // mirror
  return m > 1 ? 2 - m : m;
}

function sampleBilinear(
  src: ImageData,
  u: number,
  v: number,
  out: [number, number, number, number]
): void {
  const W = src.width;
  const H = src.height;
  const x = u * (W - 1);
  const y = v * (H - 1);
  const x0 = Math.max(0, Math.min(W - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(H - 1, Math.floor(y)));
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const d = src.data;
  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  for (let k = 0; k < 4; k++) {
    out[k] = d[i00 + k] * w00 + d[i10 + k] * w10 + d[i01 + k] * w01 + d[i11 + k] * w11;
  }
}

export function renderPlaygroundCpu(input: PlaygroundCpuInput): ImageData {
  const { pixels, preset, params, W, H, imgAspect, zoom, c, panMode, fill } = input;
  const out = new ImageData(W, H);
  const halfX = Math.max(imgAspect, 1);
  const halfY = Math.max(1 / imgAspect, 1);
  const rgba: [number, number, number, number] = [0, 0, 0, 0];

  for (let py = 0; py < H; py++) {
    const nyUp = 1 - (py + 0.5) / H;
    const zim = (2 * nyUp - 1) * halfY / zoom;
    for (let px = 0; px < W; px++) {
      const nx = (px + 0.5) / W;
      const zre = (2 * nx - 1) * halfX / zoom;
      let z: Complex = { re: zre, im: zim };
      if (panMode === 'domain') z = cadd(z, c);
      let w = preset.f(z, params);
      if (panMode === 'output') w = cadd(w, c);
      const u = wrap1(0.5 + 0.5 * w.re / halfX, fill);
      const v = wrap1(0.5 - 0.5 * w.im / halfY, fill);
      sampleBilinear(pixels, u, v, rgba);
      const idx = (py * W + px) * 4;
      out.data[idx] = rgba[0];
      out.data[idx + 1] = rgba[1];
      out.data[idx + 2] = rgba[2];
      out.data[idx + 3] = rgba[3];
    }
  }
  return out;
}

// re-export so the stage can build a zero pan without importing presets twice
export const ZERO_C = cx(0, 0);
