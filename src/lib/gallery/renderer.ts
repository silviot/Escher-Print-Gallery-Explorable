import { drosteGeometry, fitCropToNest } from '../math/droste';
import { sampleDroste, type DrosteCtx } from '../math/transforms';
import { PipelinePanelGLRenderer } from '../render/pipeline-gl';
import type { GalleryItem } from './types';

export interface GalleryScene {
  image: HTMLImageElement;
  pixels: ImageData;
  ctx: DrosteCtx;
  radius: number;
}

// Keep only a few decoded scenes; opening a collection must not decode it all.
const scenes = new Map<string, Promise<GalleryScene>>();
export function loadGalleryScene(item: GalleryItem): Promise<GalleryScene> {
  const key = JSON.stringify([item.src, item.nest, item.shape]);
  const cached = scenes.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = item.src;
    await image.decode();
    const n = item.nest;
    if (![n.x, n.y, n.w, n.h].every(Number.isFinite) || n.w <= 0 || n.h <= 0 || n.w >= 1 || n.h >= 1 || n.x < 0 || n.y < 0 || n.x + n.w > 1 || n.y + n.h > 1) {
      throw new Error('This image needs a valid inner frame.');
    }
    const nest = { x: n.x * image.width, y: n.y * image.height, w: n.w * image.width, h: n.h * image.height };
    const crop = fitCropToNest(image, nest);
    const geom = drosteGeometry({ width: crop.w, height: crop.h }, { ...nest, x: nest.x - crop.x, y: nest.y - crop.y });
    const f = Math.min(1, 1280 / Math.max(image.width, image.height));
    const source = document.createElement('canvas');
    source.width = Math.round(image.width * f);
    source.height = Math.round(image.height * f);
    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image rendering is unavailable.');
    context.drawImage(image, 0, 0, source.width, source.height);
    return {
      image,
      pixels: context.getImageData(0, 0, source.width, source.height),
      radius: geom.rMax / Math.sqrt(geom.S),
      ctx: {
        cx: geom.limit.x, cy: geom.limit.y, logS: geom.logS,
        rMax: geom.rMax, W: crop.w, H: crop.h,
        cropX: crop.x, cropY: crop.y, sampleScale: source.width / image.width,
        shapeMorph: item.shape === 'ellipse' ? 0 : 1
      }
    };
  })();
  scenes.set(key, promise);
  if (scenes.size > 3) scenes.delete(scenes.keys().next().value!);
  void promise.catch(() => { if (scenes.get(key) === promise) scenes.delete(key); });
  return promise;
}

/** The app's actual log-polar transform, with a bounded CPU fallback. */
export class GalleryRenderer {
  private gpu: PipelinePanelGLRenderer | null = null;
  readonly fallback: boolean;
  constructor(private canvas: HTMLCanvasElement, private cpuCanvas: HTMLCanvasElement) {
    try {
      const gpu = new PipelinePanelGLRenderer();
      gpu.init(canvas);
      this.gpu = gpu;
    } catch { /* A separate 2D canvas also works after a GL init failure. */ }
    this.fallback = !this.gpu;
  }

  render(scene: GalleryScene, twist: number, phase: number): void {
    const target = this.gpu ? this.canvas : this.cpuCanvas;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = this.gpu ? Math.min(devicePixelRatio || 1, 1.75, 1200 / Math.max(rect.width, rect.height)) : Math.min(1, 300 / Math.max(rect.width, rect.height));
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    const ctx = scene.ctx;
    const scale = Math.max(W / ctx.W, H / ctx.H);
    const offsetX = (ctx.W - W / scale) / 2;
    const offsetY = (ctx.H - H / scale) / 2;
    const k = twist * ctx.logS / (2 * Math.PI);
    const pan = -phase * ctx.logS;
    const lnR0 = Math.log(scene.radius);
    if (this.gpu) {
      this.gpu.render({ pixels: scene.pixels, ctx, mode: 'escher', W, H, scale, lnR0, kTwist: k, panU: pan, viewOffset: [offsetX, offsetY] });
      return;
    }
    if (target.width !== W) target.width = W;
    if (target.height !== H) target.height = H;
    const context = target.getContext('2d');
    if (!context) return;
    const out = context.createImageData(W, H);
    const rgba: [number, number, number, number] = [0, 0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + .5) / scale + offsetX - ctx.cx, dy = (y + .5) / scale + offsetY - ctx.cy;
      const radius = Math.hypot(dx, dy);
      if (radius < 1e-9) continue;
      const l = Math.log(radius), angle = Math.atan2(dy, dx);
      const r = Math.exp(l + k * angle + pan);
      const v = angle - k * (l - lnR0);
      if (sampleDroste(scene.pixels, ctx, ctx.cx + r * Math.cos(v), ctx.cy + r * Math.sin(v), rgba)) {
        const i = (y * W + x) * 4;
        out.data[i] = rgba[0]; out.data[i + 1] = rgba[1]; out.data[i + 2] = rgba[2]; out.data[i + 3] = rgba[3];
      }
    }
    context.putImageData(out, 0, 0);
  }
  dispose(): void { this.gpu?.dispose(); this.gpu = null; }
}
