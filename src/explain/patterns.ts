/**
 * Source content for the explain.html explorable.
 *
 * Four modes feed the same pipeline so you can watch the Droste→Escher map act
 * on different things:
 *   picture  — the test photograph.
 *   grid     — a cartesian grid centred on the limit point c.
 *   polar    — concentric circles + spokes centred on c. Each circle has its
 *              own style (thick / dashed / plain, in ink then red) so you can
 *              follow an individual ring through the transform; in the log
 *              panel a circle becomes a vertical line.
 *   overlay  — the photograph with the grid and polar drawn on top.
 *
 * Patterns are drawn at the photo's pixel size, centred on c (image coords),
 * and the rings are spaced by S^(1/6) so the style cycle repeats exactly once
 * per Droste period — i.e. the pattern is invariant under scaling by S about
 * c, the same self-similarity the photo has, so the fold stays seamless.
 */

export type SourceMode = 'picture' | 'grid' | 'polar' | 'overlay';

const INK = '#26424a';
const RED = '#d1495b';
const RINGS_PER_PERIOD = 6;

type RingStyle = { width: number; dash: number[]; color: string };

function ringStyle(n: number, overlay: boolean): RingStyle {
  const ink = overlay ? 'rgba(255,255,255,0.92)' : INK;
  const red = overlay ? '#ff6b7a' : RED;
  const cycle: RingStyle[] = [
    { width: 5, dash: [], color: ink }, //        thick
    { width: 2.5, dash: [11, 9], color: ink }, //  dashed
    { width: 2.5, dash: [], color: ink }, //       plain
    { width: 5, dash: [], color: red }, //         thick red
    { width: 2.5, dash: [11, 9], color: red }, //  dashed red
    { width: 2.5, dash: [], color: red } //        plain red
  ];
  return cycle[((n % RINGS_PER_PERIOD) + RINGS_PER_PERIOD) % RINGS_PER_PERIOD];
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, overlay: boolean): void {
  const step = Math.min(W, H) / 16;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.42)' : 'rgba(43,58,66,0.30)';
  for (let x = cx % step; x < W; x += step) line(ctx, Math.round(x) + 0.5, 0, Math.round(x) + 0.5, H);
  for (let y = cy % step; y < H; y += step) line(ctx, 0, Math.round(y) + 0.5, W, Math.round(y) + 0.5);
  // Coloured axes through c, so orientation is trackable through the warp.
  ctx.lineWidth = overlay ? 3 : 4;
  ctx.strokeStyle = overlay ? '#ff6b7a' : RED;
  line(ctx, 0, cy, W, cy);
  ctx.strokeStyle = overlay ? '#74c0ff' : '#2e86ab';
  line(ctx, cx, 0, cx, H);
  ctx.restore();
}

function drawPolar(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, S: number, overlay: boolean): void {
  // Reach past the farthest corner so the rings fill the frame.
  const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 4;
  const ratio = Math.pow(Math.max(S, 1.001), 1 / RINGS_PER_PERIOD);

  ctx.save();
  // Spokes first (under the rings) — a spoke is a horizontal line in the log.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.45)' : 'rgba(43,58,66,0.28)';
  for (let s = 0; s < 12; s++) {
    const a = (s * Math.PI) / 6;
    line(ctx, cx, cy, cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
  }
  // One red reference spoke at θ = 0.
  ctx.lineWidth = 3;
  ctx.strokeStyle = overlay ? '#ff6b7a' : RED;
  line(ctx, cx, cy, cx + maxR, cy);

  // Rings, outermost in. Styles cycle every period (×S) → S-invariant, seamless.
  let r = maxR;
  let n = 0;
  while (r > 3) {
    const st = ringStyle(n, overlay);
    ctx.lineWidth = st.width;
    ctx.setLineDash(st.dash);
    ctx.strokeStyle = st.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    r /= ratio;
    n++;
  }
  ctx.setLineDash([]);
  ctx.fillStyle = overlay ? '#fff' : INK;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Render the chosen source to an ImageData at the photo's pixel size. `c` is
 * the limit point in image coordinates; `S` the Droste scale (for ring
 * spacing). The pipeline samples this exactly like a loaded photo.
 */
export function makeSource(
  mode: SourceMode,
  photo: CanvasImageSource,
  W: number,
  H: number,
  cx: number,
  cy: number,
  S: number
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');

  if (mode === 'picture' || mode === 'overlay') {
    ctx.drawImage(photo, 0, 0, W, H);
    if (mode === 'overlay') {
      ctx.fillStyle = 'rgba(18,14,8,0.30)'; // mute the photo so the lines read
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, W, H);
  }

  const overlay = mode === 'overlay';
  if (mode === 'grid' || overlay) drawGrid(ctx, W, H, cx, cy, overlay);
  if (mode === 'polar' || overlay) drawPolar(ctx, W, H, cx, cy, S, overlay);

  return ctx.getImageData(0, 0, W, H);
}
