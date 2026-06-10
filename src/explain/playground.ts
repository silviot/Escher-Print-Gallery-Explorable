/**
 * Function playground for explain.html — a free, self-contained complex-function
 * explorer that runs *before* the tententoon construction.
 *
 * The point is to teach the language the rest of the page speaks: a function is
 * a machine that moves the plane. The reader drags a point on the left (the
 * input plane) and watches where it lands on the right (the output plane), with
 * a grid, rings, or a photo riding along so the whole warp is visible.
 *
 * A slider scrubs from the identity to the chosen function:
 *
 *     f_t(z) = (1 − t)·z + t·f(z)
 *
 * That interpolation is a teaching tool, not the real math — it lets the plane
 * be *pulled* into place instead of snapping there. The order of functions
 * (z, 2z, iz, c·z, z², exp, log) walks from "nothing moves" up to the exp/log
 * pair the tententoon is built from. Two specials: c·z has a draggable gold
 * constant (grab c and steer the scale-and-spin yourself), and a final
 * non-complex impostor written on (x, y) coordinates shears its little square —
 * the hands-on proof that conformality belongs to complex arithmetic.
 *
 * Pure Canvas 2D, no WebGL and no dependency on the Droste pipeline: these are
 * general maps, not the one specific map. Grid/ring lines are drawn by sampling
 * each line, mapping every sample through f_t, and stroking the result as a
 * polyline (broken where the map jumps, e.g. log's branch cut). The photo, when
 * shown, is forward-warped through a small triangle mesh.
 */

type C = { re: number; im: number };

type FnKey = 'id' | 'double' | 'rot' | 'mul' | 'square' | 'exp' | 'log' | 'xy';
// `fixedOut`, when set, pins the output plane to that half-extent instead of
// auto-fitting. The linear maps MUST share the input scale (D): if the output
// viewport auto-grew to fit 2z, the doubling would be cancelled by the zoom and
// the grid would look untouched. Pinning to D makes "everything doubled" read as
// a visibly coarser grid and a point flung outward. Nonlinear maps (z², exp,
// log) leave it unset and auto-fit — for them the lesson is the *shape* change,
// not a uniform scale, and they need the extra room to stay framed.
type Fn = { key: FnKey; label: string; map: (z: C) => C; fixedOut?: number };

// Input half-extent: the plane shown is [−D, D]². Chosen as π so the vertical
// span is exactly 2π — exp(z) maps the imaginary part to the output angle, so
// only a 2π-tall strip rolls the full way around the origin into closed circles.
// Anything smaller leaves the exp rings visibly open (a height of h wraps just
// h/2π of the lap). This 2π periodicity is the same one that closes the
// tententoon spiral.
const D = Math.PI;

// The draggable constant for f(z) = c·z. 1.2 + 0.9i is a 3-4-5 triangle:
// |c| = 1.5 and arg c ≈ 36.9°, so the map visibly scales AND spins at once.
const MUL_C0: C = { re: 1.2, im: 0.9 };
const mulC: C = { ...MUL_C0 };

const FNS: Fn[] = [
  { key: 'id', label: 'f(z) = z', map: (z) => ({ re: z.re, im: z.im }), fixedOut: D },
  { key: 'double', label: 'f(z) = 2z', map: (z) => ({ re: 2 * z.re, im: 2 * z.im }), fixedOut: D },
  // i·z = i(x + iy) = −y + ix : a quarter-turn.
  { key: 'rot', label: 'f(z) = iz', map: (z) => ({ re: -z.im, im: z.re }), fixedOut: D },
  {
    // (a+bi)(x+iy) — the general scale-and-spin, steered by dragging c. The
    // whole map is pinned by two facts: 0 stays put, and 1 lands on c.
    key: 'mul',
    label: 'f(z) = c·z',
    map: (z) => ({ re: mulC.re * z.re - mulC.im * z.im, im: mulC.re * z.im + mulC.im * z.re }),
    fixedOut: D
  },
  { key: 'square', label: 'f(z) = z²', map: (z) => ({ re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }) },
  {
    key: 'exp',
    label: 'f(z) = exp(z)',
    map: (z) => {
      const e = Math.exp(z.re);
      return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
    }
  },
  {
    key: 'log',
    label: 'f(z) = log(z)',
    map: (z) => ({ re: 0.5 * Math.log(z.re * z.re + z.im * z.im), im: Math.atan2(z.im, z.re) })
  },
  {
    // The impostor: a perfectly smooth recipe written on coordinates (x, y)
    // rather than in complex arithmetic. It bends the grid much like z² does,
    // but it is not complex multiplication near any point, so the little
    // square shears — the one thing no complex function ever does.
    key: 'xy',
    label: 'f(x, y) = (x − y², y + x²)',
    map: (z) => ({ re: z.re - z.im * z.im, im: z.im + z.re * z.re })
  }
];

const PHOTO = '/Droste_1260359-nevit.jpg';
const GRID_STEP = Math.PI / 8; // ≈0.393; divides D = π evenly, no edge sliver
const NEIGH = 0.17; // half-side of the little square drawn around the dragged point
const LINE_SAMPLES = 100;
const MESH = 22; // triangle-mesh resolution for the photo warp

const ACCENT = '#d94f2c';
const ACCENT_DEEP = '#a83a1d';
const INK = '#26424a';
const RED = '#d1495b';
const BLUE = '#2e86ab';
const GOLD = '#e0a32e'; // the draggable constant c and everything it pins down

const byId = <T extends Element>(id: string) => document.getElementById(id) as T | null;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function initPlayground(): void {
  const root = byId<HTMLElement>('pg-root');
  if (!root) return;
  const inEl = byId<HTMLCanvasElement>('pg-in');
  const outEl = byId<HTMLCanvasElement>('pg-out');
  const ictx0 = inEl?.getContext('2d') ?? null;
  const octx0 = outEl?.getContext('2d') ?? null;
  if (!inEl || !outEl || !ictx0 || !octx0) return;
  // Narrowed, non-null aliases so the closures below stay type-clean.
  const inCanvas = inEl;
  const outCanvas = outEl;
  const ictx = ictx0;
  const octx = octx0;

  const state = {
    fn: FNS[0],
    t: 1, // identity → f
    z: { re: 1.1, im: 0.6 } as C,
    grid: true,
    rings: false,
    image: false
  };

  // The photo, lazily; the "image" layer is dormant until it loads.
  let photo: HTMLImageElement | null = null;
  let photoSq: { canvas: HTMLCanvasElement; size: number } | null = null;
  const img = new Image();
  img.decoding = 'async';
  img.src = PHOTO;
  img.decode().then(() => {
    photo = img;
    // Pre-crop to a centred square so the domain maps to it cleanly.
    const size = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d');
    if (cx) {
      cx.drawImage(
        img,
        (img.naturalWidth - size) / 2,
        (img.naturalHeight - size) / 2,
        size, size, 0, 0, size, size
      );
      photoSq = { canvas: c, size };
    }
    if (state.image) draw();
  }).catch(() => { /* image layer simply stays unavailable */ });

  // ── interpolated map ───────────────────────────────────────────────────────
  function ft(z: C): C {
    const f = state.fn.map(z);
    const t = state.t;
    return { re: lerp(z.re, f.re, t), im: lerp(z.im, f.im, t) };
  }

  // ── output framing: fit the t=1 image, fixed per function ───────────────────
  // Recomputed when the function changes; held steady while dragging or
  // scrubbing so the frame doesn't lurch under the reader.
  let outE = D;
  function computeOutExtent(): void {
    if (state.fn.fixedOut !== undefined) { outE = state.fn.fixedOut; return; }
    let m = D * 0.5;
    const N = 24;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const re = lerp(-D, D, i / N);
        const im = lerp(-D, D, j / N);
        const r2 = re * re + im * im;
        if (state.fn.key === 'log' && r2 < 0.04) continue; // skip the singularity
        const w = state.fn.map({ re, im });
        m = Math.max(m, Math.abs(w.re), Math.abs(w.im));
      }
    }
    outE = clamp(m * 1.08, 1.6, 8);
  }
  computeOutExtent();

  // ── canvas sizing (DPR-aware, square) ───────────────────────────────────────
  let cw = 0;
  let ch = 0;
  function resize(): void {
    const rect = inCanvas.getBoundingClientRect();
    if (!rect || rect.width === 0) return; // not laid out yet; ResizeObserver retries
    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(1, Math.round(rect.width * dpr));
    cw = px;
    ch = px;
    for (const cv of [inCanvas, outCanvas]) {
      cv.width = px;
      cv.height = px;
    }
  }

  // plane → pixel mappers
  const toIn = (z: C) => ({ x: cw / 2 + (z.re / D) * (cw / 2), y: ch / 2 - (z.im / D) * (ch / 2) });
  const toOut = (z: C) => ({ x: cw / 2 + (z.re / outE) * (cw / 2), y: ch / 2 - (z.im / outE) * (ch / 2) });
  // pixel → plane, for the input canvas (dragging)
  const fromIn = (x: number, y: number): C => ({
    re: ((x - cw / 2) / (cw / 2)) * D,
    im: -((y - ch / 2) / (ch / 2)) * D
  });

  // ── drawing helpers ─────────────────────────────────────────────────────────
  function clearPlane(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e0c09';
    ctx.fillRect(0, 0, cw, ch);
  }

  // A polyline through f_t, broken when consecutive samples jump too far (a
  // branch cut or a blow-up) so we don't draw a false chord across the plane.
  function strokeMappedPath(
    ctx: CanvasRenderingContext2D,
    pts: C[],
    map: (z: C) => { x: number; y: number },
    apply: boolean
  ): void {
    const jump = cw * 0.5;
    let started = false;
    let px = 0;
    let py = 0;
    ctx.beginPath();
    for (const z of pts) {
      const w = apply ? ft(z) : z;
      const p = map(w);
      if (started && (Math.abs(p.x - px) > jump || Math.abs(p.y - py) > jump)) {
        started = false; // break the line here
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
      px = p.x;
      py = p.y;
    }
    ctx.stroke();
  }

  function lineSamples(a: C, b: C): C[] {
    const out: C[] = [];
    for (let i = 0; i <= LINE_SAMPLES; i++) {
      const u = i / LINE_SAMPLES;
      out.push({ re: lerp(a.re, b.re, u), im: lerp(a.im, b.im, u) });
    }
    return out;
  }

  function ringSamples(r: number): C[] {
    const out: C[] = [];
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI; // start at −π so the cut sits at an end
      out.push({ re: r * Math.cos(a), im: r * Math.sin(a) });
    }
    return out;
  }

  function drawGrid(ctx: CanvasRenderingContext2D, map: (z: C) => { x: number; y: number }, apply: boolean): void {
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(220,228,232,0.22)';
    for (let g = -D; g <= D + 1e-6; g += GRID_STEP) {
      if (Math.abs(g) < 1e-6) continue; // axes drawn separately, coloured
      strokeMappedPath(ctx, lineSamples({ re: g, im: -D }, { re: g, im: D }), map, apply);
      strokeMappedPath(ctx, lineSamples({ re: -D, im: g }, { re: D, im: g }), map, apply);
    }
    // coloured axes — track orientation through the warp
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = RED; // real axis (im = 0)
    strokeMappedPath(ctx, lineSamples({ re: -D, im: 0 }, { re: D, im: 0 }), map, apply);
    ctx.strokeStyle = BLUE; // imaginary axis (re = 0)
    strokeMappedPath(ctx, lineSamples({ re: 0, im: -D }, { re: 0, im: D }), map, apply);
  }

  function drawRings(ctx: CanvasRenderingContext2D, map: (z: C) => { x: number; y: number }, apply: boolean): void {
    // spokes
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(220,228,232,0.20)';
    for (let s = 0; s < 12; s++) {
      const a = (s * Math.PI) / 6;
      const dir = { re: Math.cos(a), im: Math.sin(a) };
      if (s === 0) continue;
      strokeMappedPath(ctx, lineSamples({ re: 0, im: 0 }, { re: dir.re * D, im: dir.im * D }), map, apply);
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = RED; // reference spoke θ = 0
    strokeMappedPath(ctx, lineSamples({ re: 0.02, im: 0 }, { re: D, im: 0 }), map, apply);
    // rings
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(120,190,230,0.55)';
    for (let r = GRID_STEP; r <= D + 1e-6; r += GRID_STEP) {
      strokeMappedPath(ctx, ringSamples(r), map, apply);
    }
  }

  // Affine-map one source triangle of the photo into a destination triangle.
  function texTri(
    ctx: CanvasRenderingContext2D,
    src: { canvas: HTMLCanvasElement; size: number },
    s: { x: number; y: number }[],
    d: { x: number; y: number }[]
  ): void {
    const [s0, s1, s2] = s;
    const [d0, d1, d2] = d;
    const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    if (Math.abs(den) < 1e-6) return;
    const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
    const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
    const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
    const d_ = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
    const e = d0.x - a * s0.x - c * s0.y;
    const f = d0.y - b * s0.x - d_ * s0.y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d_, e, f);
    ctx.drawImage(src.canvas, 0, 0);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawPhoto(ctx: CanvasRenderingContext2D, map: (z: C) => { x: number; y: number }, apply: boolean): void {
    if (!photoSq) return;
    const sz = photoSq.size;
    // domain [−D,D]² ↔ source square [0,sz]²
    const toSrc = (re: number, im: number) => ({
      x: ((re + D) / (2 * D)) * sz,
      y: ((D - im) / (2 * D)) * sz
    });
    for (let i = 0; i < MESH; i++) {
      for (let j = 0; j < MESH; j++) {
        const re0 = lerp(-D, D, i / MESH);
        const re1 = lerp(-D, D, (i + 1) / MESH);
        const im0 = lerp(-D, D, j / MESH);
        const im1 = lerp(-D, D, (j + 1) / MESH);
        const corners: C[] = [
          { re: re0, im: im0 }, { re: re1, im: im0 },
          { re: re1, im: im1 }, { re: re0, im: im1 }
        ];
        const sc = corners.map((p) => toSrc(p.re, p.im));
        const dc = corners.map((p) => map(apply ? ft(p) : p));
        // A cell straddling a branch-cut jump (log's seam) would smear one giant
        // triangle across the panel; drop it — a thin missing seam reads better.
        const jump = cw * 0.5;
        let ok = true;
        for (let a = 0; a < 4 && ok; a++) {
          for (let b = a + 1; b < 4; b++) {
            if (Math.abs(dc[a].x - dc[b].x) > jump || Math.abs(dc[a].y - dc[b].y) > jump) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;
        texTri(ctx, photoSq, [sc[0], sc[1], sc[2]], [dc[0], dc[1], dc[2]]);
        texTri(ctx, photoSq, [sc[0], sc[2], sc[3]], [dc[0], dc[2], dc[3]]);
      }
    }
  }

  function dot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, color: string, r: number): void {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }

  function label(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, text: string, color: string): void {
    ctx.font = `italic 600 ${Math.max(11, Math.round(cw * 0.026))}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, p.x + cw * 0.014, p.y - ch * 0.014);
  }

  // The story of f(z) = c·z lives in two marked points: 0 stays put, and 1 is
  // dragged onto c — that alone pins the whole scale-and-spin. Input side: the
  // point 1, the gold handle c, and the ray 0 → c. Output side: where 1 lands.
  function drawMulMarkers(ctx: CanvasRenderingContext2D, map: (z: C) => { x: number; y: number }, apply: boolean): void {
    const one: C = { re: 1, im: 0 };
    if (!apply) {
      const pc = map(mulC);
      const p0 = map({ re: 0, im: 0 });
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(224,163,46,0.55)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const p1 = map(one);
      dot(ctx, p1, 'rgba(255,255,255,0.92)', 4);
      label(ctx, p1, '1', 'rgba(255,255,255,0.92)');
      dot(ctx, pc, GOLD, 7);
      label(ctx, pc, 'c', GOLD);
    } else {
      const p1 = map(ft(one)); // at t = 1 this sits exactly on c
      dot(ctx, p1, GOLD, 5);
      label(ctx, p1, 'c·1', GOLD);
    }
  }

  // the little neighbour square — stays near-square for analytic maps
  function neighbourSquare(z: C): C[] {
    return [
      { re: z.re - NEIGH, im: z.im - NEIGH },
      { re: z.re + NEIGH, im: z.im - NEIGH },
      { re: z.re + NEIGH, im: z.im + NEIGH },
      { re: z.re - NEIGH, im: z.im + NEIGH }
    ];
  }

  function drawSquare(ctx: CanvasRenderingContext2D, corners: C[], map: (z: C) => { x: number; y: number }, apply: boolean): void {
    // dense path so the sides bend with the map
    const pts: C[] = [];
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      for (let i = 0; i < 18; i++) pts.push({ re: lerp(a.re, b.re, i / 18), im: lerp(a.im, b.im, i / 18) });
    }
    pts.push(corners[0]);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = 'rgba(217,79,44,0.18)';
    ctx.beginPath();
    let started = false;
    const jump = cw * 0.5;
    let px = 0;
    let py = 0;
    for (const z of pts) {
      const w = apply ? ft(z) : z;
      const p = map(w);
      if (started && (Math.abs(p.x - px) > jump || Math.abs(p.y - py) > jump)) started = false;
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      px = p.x; py = p.y;
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawAxesFrame(ctx: CanvasRenderingContext2D, isInput: boolean): void {
    // faint origin crosshair so the centre is locatable even when layers are off
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, ch);
    ctx.moveTo(0, ch / 2); ctx.lineTo(cw, ch / 2);
    ctx.stroke();
    if (!isInput) return;
    // Scale cues, input side only. The plane spans exactly [−π, π] each way —
    // 2π tall, the height exp wraps into one full lap — and the points 1 and i
    // anchor the multiplication story (skip 1 when the gold c-markers draw it).
    const fs = Math.max(10, Math.round(cw * 0.02));
    ctx.font = `${fs}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    const pad = Math.max(4, cw * 0.012);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('−π', pad, ch / 2 - pad);
    ctx.textAlign = 'right';
    ctx.fillText('π', cw - pad, ch / 2 - pad);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('π', cw / 2 + pad, pad);
    ctx.textBaseline = 'bottom';
    ctx.fillText('−π', cw / 2 + pad, ch - pad);
    ctx.textBaseline = 'alphabetic';
    const pi = toIn({ re: 0, im: 1 });
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(pi.x, pi.y, 3, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, pi, 'i', 'rgba(255,255,255,0.6)');
    if (state.fn.key !== 'mul') {
      const p1 = toIn({ re: 1, im: 0 });
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, p1, '1', 'rgba(255,255,255,0.6)');
    }
  }

  function drawSide(ctx: CanvasRenderingContext2D, map: (z: C) => { x: number; y: number }, apply: boolean): void {
    clearPlane(ctx);
    if (state.image) drawPhoto(ctx, map, apply);
    drawAxesFrame(ctx, !apply);
    if (state.grid) drawGrid(ctx, map, apply);
    if (state.rings) drawRings(ctx, map, apply);
    drawSquare(ctx, neighbourSquare(state.z), map, apply);
    if (state.fn.key === 'mul') drawMulMarkers(ctx, map, apply);
    dot(ctx, map(apply ? ft(state.z) : state.z), ACCENT, 6.5);
  }

  function draw(): void {
    if (cw === 0) {
      resize();
      if (cw === 0) return; // still not laid out; wait for ResizeObserver
    }
    drawSide(ictx, toIn, false);
    drawSide(octx, toOut, true);
    updateReadout();
  }

  // ── readouts ────────────────────────────────────────────────────────────────
  const zOut = byId<HTMLElement>('pg-z');
  const fzOut = byId<HTMLElement>('pg-fz');
  const fmt = (z: C) => {
    const r = z.re.toFixed(2);
    const i = Math.abs(z.im).toFixed(2);
    return `${r} ${z.im < 0 ? '−' : '+'} ${i}i`;
  };
  function updateReadout(): void {
    if (zOut) zOut.textContent = fmt(state.z);
    if (fzOut) fzOut.textContent = fmt(ft(state.z));
  }

  // ── controls ────────────────────────────────────────────────────────────────
  // Every function click is a watched transformation, not a before/after snap:
  // pull the plane from the identity to the new map, so the motion teaches.
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
  let animRaf = 0;
  function stopAnim(): void {
    if (animRaf) cancelAnimationFrame(animRaf);
    animRaf = 0;
  }
  function animateToFn(): void {
    stopAnim();
    const t0 = performance.now();
    const DUR = 900;
    const step = (now: number): void => {
      const u = Math.min(1, (now - t0) / DUR);
      state.t = easeOutCubic(u);
      if (tSlider) tSlider.value = String(Math.round(state.t * 100));
      draw();
      animRaf = u < 1 ? requestAnimationFrame(step) : 0;
    };
    animRaf = requestAnimationFrame(step);
  }

  function selectFn(key: FnKey): void {
    const f = FNS.find((x) => x.key === key);
    if (!f) return;
    state.fn = f;
    computeOutExtent();
    document.querySelectorAll<HTMLElement>('.pg-fn').forEach((b) => b.classList.toggle('on', b.dataset.fn === key));
    animateToFn();
  }
  document.querySelectorAll<HTMLElement>('.pg-fn').forEach((b) => {
    b.addEventListener('click', () => selectFn((b.dataset.fn as FnKey) ?? 'id'));
  });

  function setLayer(name: 'grid' | 'rings' | 'image', on: boolean): void {
    state[name] = on;
    document.querySelectorAll<HTMLElement>(`[data-layer="${name}"]`).forEach((b) => b.classList.toggle('on', on));
    draw();
  }
  document.querySelectorAll<HTMLElement>('[data-layer]').forEach((b) => {
    b.addEventListener('click', () => {
      const name = b.dataset.layer as 'grid' | 'rings' | 'image';
      if (name === 'image' && !photoSq) return;
      setLayer(name, !state[name]);
    });
  });

  const tSlider = byId<HTMLInputElement>('pg-t');
  if (tSlider) {
    tSlider.min = '0';
    tSlider.max = '100';
    tSlider.step = '1';
    tSlider.value = '100';
    tSlider.addEventListener('input', () => {
      stopAnim();
      state.t = parseFloat(tSlider.value) / 100;
      draw();
    });
  }

  byId<HTMLButtonElement>('pg-reset')?.addEventListener('click', () => {
    stopAnim();
    state.z = { re: 1.1, im: 0.6 };
    mulC.re = MUL_C0.re;
    mulC.im = MUL_C0.im;
    state.t = 1;
    if (tSlider) tSlider.value = '100';
    draw();
  });

  // ── drag the input point (or, for f(z) = c·z, the gold constant) ───────────
  let dragging = false;
  let dragTarget: 'z' | 'c' = 'z';
  function pointerPx(e: PointerEvent): { x: number; y: number } {
    const rect = inCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }
  function pointerToZ(e: PointerEvent): C {
    const p = pointerPx(e);
    const z = fromIn(p.x, p.y);
    return { re: clamp(z.re, -D, D), im: clamp(z.im, -D, D) };
  }
  function applyDrag(e: PointerEvent): void {
    const z = pointerToZ(e);
    if (dragTarget === 'c') {
      mulC.re = z.re;
      mulC.im = z.im;
    } else {
      state.z = z;
    }
  }
  inCanvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragTarget = 'z';
    if (state.fn.key === 'mul') {
      // Grab c instead of teleporting z when the press lands on the gold
      // handle — unless z itself is closer (z is drawn on top, so when the
      // two overlap a press on the visible dot must move z, not c).
      const p = pointerPx(e);
      const pc = toIn(mulC);
      const pz = toIn(state.z);
      const grab = 26 * (window.devicePixelRatio || 1);
      const dc = Math.hypot(p.x - pc.x, p.y - pc.y);
      const dz = Math.hypot(p.x - pz.x, p.y - pz.y);
      if (dc < grab && dc <= dz) dragTarget = 'c';
    }
    applyDrag(e);
    try { inCanvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    e.preventDefault();
    draw();
  });
  inCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyDrag(e);
    draw();
  });
  const end = (e: PointerEvent) => {
    dragging = false;
    try { inCanvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  inCanvas.addEventListener('pointerup', end);
  inCanvas.addEventListener('pointercancel', end);

  // ── boot ──────────────────────────────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('.pg-fn').forEach((b) => b.classList.toggle('on', b.dataset.fn === state.fn.key));
  // ResizeObserver fires once on observe, which lays the first frame down after
  // layout exists — so a module that evaluates before CSS is applied still draws.
  new ResizeObserver(() => { resize(); draw(); }).observe(root);
  // And one deferred pass in case the observer is slow on the very first paint.
  requestAnimationFrame(() => {
    setLayer('grid', state.grid);
    resize();
    draw();
  });
}
