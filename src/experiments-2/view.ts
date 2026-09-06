/** The experiments share the real transform, including a small CPU fallback. */
import { SpiralView as GPUView, buildScene, loadImageEl, type Scene, type SpiralRenderOpts } from '../experiments/kit';
import { sampleDroste } from '../lib/math/transforms';
import { panelPxPerUnit } from '../lib/ui1/pipeline-panels';

export class SpiralView {
  readonly canvas: HTMLCanvasElement;
  private gpu: GPUView | null = null;
  private scene: Scene | null = null;
  private lastKey = '';
  private lastTime = 0;
  private pending = 0;
  private pendingOpts: SpiralRenderOpts = {};
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    try { this.gpu = new GPUView(canvas); } catch { canvas.dataset.renderer = 'cpu'; }
  }
  setScene(scene: Scene): void {
    clearTimeout(this.pending); this.pending = 0;
    this.scene = scene; this.gpu?.setScene(scene); this.lastKey = '';
  }
  autosize(maxDpr = 1.5): boolean {
    if (this.gpu) return this.gpu.autosize(maxDpr);
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const scale = Math.min(1, 420 / Math.max(r.width, r.height));
    const w = Math.round(r.width * scale), h = Math.round(r.height * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.lastKey = ''; }
    return true;
  }
  render(opts: SpiralRenderOpts = {}): void {
    if (this.gpu) { this.gpu.render(opts); return; }
    const scene = this.scene;
    if (!scene) return;
    const key = JSON.stringify(opts) + ':' + this.canvas.width + ':' + this.canvas.height;
    if (key === this.lastKey) { clearTimeout(this.pending); this.pending = 0; return; }
    // Bound work on devices without WebGL; a user's final slider state is
    // always painted, even when animation requests arrive more quickly.
    if (performance.now() - this.lastTime < 80) {
      this.pendingOpts = { ...opts };
      if (!this.pending) this.pending = window.setTimeout(() => {
        this.pending = 0;
        this.render(this.pendingOpts);
      }, 80 - (performance.now() - this.lastTime));
      return;
    }
    clearTimeout(this.pending); this.pending = 0;
    this.lastTime = performance.now();
    this.lastKey = key;
    const { ctx } = scene.geom;
    const W = this.canvas.width, H = this.canvas.height;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const out = context.createImageData(W, H);
    const mode = opts.mode ?? 'escher';
    const k = opts.kTwist ?? (opts.twist ?? 1) * ctx.logS / (2 * Math.PI);
    const t = opts.t ?? 0;
    const panU = (1 - (((t % 1) + 1) % 1)) * ctx.logS;
    const panV = opts.panV ?? 0;
    const rot = opts.rot ?? Math.atan2(ctx.logS, 2 * Math.PI);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const unit = panelPxPerUnit(mode === 'log' ? 'log' : 'rotlog', ctx.logS, H);
    const ref = Math.log(Math.max(ctx.rMax, 1));
    const R0 = Math.log(Math.max(scene.geom.R0, 1e-9));
    const scale = Math.max(W / ctx.W, H / ctx.H);
    const rgba: [number, number, number, number] = [0, 0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let u: number, v: number;
      if (mode === 'escher') {
        const dx = (x + .5) / scale - ctx.cx, dy = (y + .5) / scale - ctx.cy;
        const radius = Math.hypot(dx, dy);
        if (radius < 1e-9) continue;
        const log = Math.log(radius), phi = Math.atan2(dy, dx);
        u = log + k * phi + panU;
        v = phi - k * (log - R0) + panV;
      } else {
        const cu = (x + .5 - W / 2) / unit, cv = (y + .5 - H / 2) / unit;
        u = (mode === 'log' ? cu : cu * cos + cv * sin) + ref;
        v = mode === 'log' ? cv : -cu * sin + cv * cos;
        if (mode === 'unroll') {
          const m = opts.morph ?? 1;
          const log = Math.log(Math.max(Math.hypot(cu, cv), .06));
          const phi = Math.atan2(cv, cu);
          u = u * (1 - m) + (log + k * phi + ref) * m;
          v = v * (1 - m) + (phi - k * (log - R0)) * m;
        }
        u += panU; v += panV;
        u = ref - (((ref - u) % ctx.logS + ctx.logS) % ctx.logS);
      }
      const radius = Math.exp(u);
      if (sampleDroste(scene.pixels, ctx, ctx.cx + radius * Math.cos(v), ctx.cy + radius * Math.sin(v), rgba)) {
        const i = (y * W + x) * 4;
        out.data[i] = rgba[0]; out.data[i + 1] = rgba[1]; out.data[i + 2] = rgba[2]; out.data[i + 3] = rgba[3];
      }
    }
    context.putImageData(out, 0, 0);
  }
  dispose(): void { clearTimeout(this.pending); this.gpu?.dispose(); this.scene = null; }
}

/** A little impossible gallery, drawn here so the artwork is local and crisp. */
export async function createGalleryScene(): Promise<Scene> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1200;
  const c = canvas.getContext('2d')!;
  const polygon = (points: number[][], color: string) => {
    c.fillStyle = color; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fill();
  };
  c.fillStyle = '#eee9db'; c.fillRect(0, 0, 1200, 1200);
  // Broad planes, a tiled floor, and a repeating opening. The same square
  // aperture supplies the recursion; every view uses exactly this scene.
  polygon([[0, 0], [360, 345], [360, 855], [0, 1200]], '#d45030');
  polygon([[1200, 0], [864, 345], [864, 855], [1200, 1200]], '#eab58d');
  polygon([[0, 1200], [360, 855], [864, 855], [1200, 1200]], '#dcd9c5');
  const vanish = { x: 600, y: 540 };
  c.save();
  c.beginPath(); c.moveTo(0, 1200); c.lineTo(360, 855); c.lineTo(864, 855); c.lineTo(1200, 1200); c.clip();
  for (let i = -8; i < 15; i++) {
    if (i % 2 === 0) polygon([[vanish.x, vanish.y], [i * 170, 1240], [(i + 1) * 170, 1240]], '#244b4c');
  }
  c.fillStyle = '#eee9db';
  for (const [y, h] of [[889, 15], [951, 21], [1050, 29], [1180, 35]]) c.fillRect(0, y, 1200, h);
  c.restore();
  // A round, sunlit window in the ceiling plane.
  c.fillStyle = '#173e42'; c.beginPath(); c.arc(600, 240, 137, Math.PI, 0); c.lineTo(737, 313); c.lineTo(463, 313); c.fill();
  c.fillStyle = '#dda445'; c.beginPath(); c.arc(643, 211, 58, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#eee9db'; c.fillRect(594, 98, 10, 216); c.fillRect(460, 245, 280, 9);
  // Side artwork and a slim pedestal establish scale through each copy.
  polygon([[72, 229], [254, 378], [254, 600], [72, 520]], '#eee9db');
  polygon([[90, 263], [234, 383], [234, 567], [90, 503]], '#233e3e');
  polygon([[117, 419], [212, 394], [212, 536]], '#e5a13e');
  polygon([[969, 568], [1072, 519], [1072, 806], [969, 849]], '#f6f0de');
  polygon([[969, 568], [1034, 602], [1128, 552], [1072, 519]], '#fff9e8');
  polygon([[1034, 602], [1128, 552], [1128, 840], [1034, 894]], '#224647');
  c.fillStyle = '#cd492d'; c.beginPath(); c.ellipse(1045, 488, 44, 58, -.15, 0, Math.PI * 2); c.fill();
  // The dark lintel and cream inner edge visibly recur all the way down.
  c.fillStyle = '#173c3e'; c.fillRect(335, 323, 554, 556);
  c.fillStyle = '#f3edde'; c.fillRect(352, 340, 520, 520);
  c.fillStyle = '#152e30'; c.fillRect(360, 348, 504, 504);
  const img = await loadImageEl(canvas.toDataURL('image/png'));
  return buildScene(img, { x: 360, y: 348, w: 504, h: 504 });
}
