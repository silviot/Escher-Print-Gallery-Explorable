/**
 * Complex-playground preset library — the single source of truth shared by
 * the GPU shader, the CPU fallback, and the live-formula display.
 *
 * Each preset is a complex function f(z). The playground renders by inverse
 * map: for every output pixel at complex coord z, it samples the source image
 * at f(z) (so the picture warps the way you'd expect from "apply f"). The pan
 * constant `c` is composed per the user's toggle — domain `f(z + c)` or output
 * `f(z) + c` — outside this file (see the renderer + state).
 *
 * `mode` is the integer branch the GLSL shader (shader.frag.glsl) switches on;
 * the order here MUST match the shader. `f` / `fp` are the JS mirror used by
 * the CPU fallback and kept in lockstep with the shader's math. `fp` (= f'(z))
 * feeds footprint anti-aliasing.
 *
 * Pure module: no DOM, no Svelte, no twgl — importable from tests and the
 * worker-free CPU path alike.
 */

export type Complex = { re: number; im: number };

// --- complex arithmetic (mirrors the GLSL helpers) ---------------------
export const cx = (re: number, im = 0): Complex => ({ re, im });
export const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});
export const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im || 1e-30;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const cexp = (z: Complex): Complex => {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
};
export const clog = (z: Complex): Complex => ({
  re: 0.5 * Math.log(z.re * z.re + z.im * z.im || 1e-30),
  im: Math.atan2(z.im, z.re)
});
export const cpow = (z: Complex, w: Complex): Complex => {
  if (z.re * z.re + z.im * z.im < 1e-20) return { re: 0, im: 0 };
  return cexp(cmul(w, clog(z)));
};
export const cabs = (z: Complex): number => Math.hypot(z.re, z.im);
const csinh = (x: number) => Math.sinh(x);
const ccosh = (x: number) => Math.cosh(x);
export const csin = (z: Complex): Complex => ({
  re: Math.sin(z.re) * ccosh(z.im),
  im: Math.cos(z.re) * csinh(z.im)
});
export const ccos = (z: Complex): Complex => ({
  re: Math.cos(z.re) * ccosh(z.im),
  im: -Math.sin(z.re) * csinh(z.im)
});

const ONE = cx(1, 0);

// --- parameter schema --------------------------------------------------

export type ParamValue = number | Complex;

export type RealParam = {
  kind: 'real';
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};
export type ComplexParam = {
  kind: 'complex';
  id: string;
  label: string;
  /** Slider extent for re/im (±range), and the draggable handle's reach. */
  range: number;
  default: Complex;
  /** Show a draggable handle for this point on the canvas. */
  draggable?: boolean;
};
export type ParamDef = RealParam | ComplexParam;

export type Params = Record<string, ParamValue>;

/** GPU uniform packing: up to 4 real scalars + 3 complex params. */
export type PresetUniforms = {
  pr: [number, number, number, number];
  pa: [number, number];
  pb: [number, number];
  pc: [number, number];
};

export type Preset = {
  id: string;
  /** Shader branch — MUST match the switch in shader.frag.glsl. */
  mode: number;
  label: string;
  params: ParamDef[];
  /** f(z) for the CPU path. */
  f: (z: Complex, p: Params) => Complex;
  /** f'(z) for footprint anti-aliasing (CPU path). */
  fp: (z: Complex, p: Params) => Complex;
  /** Pack params into shader uniforms. */
  uniforms: (p: Params) => PresetUniforms;
  /**
   * Render f as readable notation in terms of `arg` (the symbol substituted
   * for z — "z" normally, "z + c" in domain-pan mode). `compound` is true when
   * `arg` is not a bare variable, so the preset can parenthesise it.
   */
  expr: (arg: string, p: Params, compound: boolean) => string;
};

const r = (p: Params, id: string) => p[id] as number;
const k = (p: Params, id: string) => p[id] as Complex;
const u2 = (c: Complex): [number, number] => [c.re, c.im];
const NO_U: PresetUniforms = { pr: [0, 0, 0, 0], pa: [0, 0], pb: [0, 0], pc: [0, 0] };

// --- formatting helpers (for `expr`) -----------------------------------

const fmt = (n: number) => {
  const s = Math.abs(n) < 1e-9 ? '0' : n.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};
/** A complex literal: "0.4", "−0.4i", "0.4 − 0.2i". */
export function fmtComplex(c: Complex): string {
  const re = Math.abs(c.re) > 1e-9;
  const im = Math.abs(c.im) > 1e-9;
  if (!re && !im) return '0';
  if (re && !im) return fmt(c.re);
  const iPart = `${fmt(Math.abs(c.im))}i`;
  if (!re) return `${c.im < 0 ? '−' : ''}${iPart}`;
  return `${fmt(c.re)} ${c.im < 0 ? '−' : '+'} ${iPart}`;
}
/** "z − 0.4" / "z + 0.4" / "z − (0.4 + 0.2i)" — folds the sign nicely. */
function sub(arg: string, c: Complex): string {
  if (Math.abs(c.re) < 1e-9 && Math.abs(c.im) < 1e-9) return arg;
  if (Math.abs(c.im) < 1e-9) return `${arg} ${c.re < 0 ? '+' : '−'} ${fmt(Math.abs(c.re))}`;
  return `${arg} − (${fmtComplex(c)})`;
}
const par = (arg: string, compound: boolean) => (compound ? `(${arg})` : arg);

// --- the shelf ---------------------------------------------------------

export const PRESETS: Preset[] = [
  {
    id: 'identity',
    mode: 0,
    label: 'Identity',
    params: [],
    f: (z) => z,
    fp: () => ONE,
    uniforms: () => NO_U,
    expr: (a) => a
  },
  {
    id: 'square',
    mode: 1,
    label: 'Square',
    params: [],
    f: (z) => cmul(z, z),
    fp: (z) => cmul(cx(2), z),
    uniforms: () => NO_U,
    expr: (a, _p, compound) => `${par(a, compound)}²`
  },
  {
    id: 'power',
    mode: 2,
    label: 'Power zⁿ',
    params: [{ kind: 'real', id: 'n', label: 'n', min: 0.2, max: 6, step: 0.05, default: 3 }],
    f: (z, p) => cpow(z, cx(r(p, 'n'))),
    fp: (z, p) => cmul(cx(r(p, 'n')), cpow(z, cx(r(p, 'n') - 1))),
    uniforms: (p) => ({ ...NO_U, pr: [r(p, 'n'), 0, 0, 0] }),
    expr: (a, p, compound) => `${par(a, compound)}^${fmt(r(p, 'n'))}`
  },
  {
    id: 'recip',
    mode: 3,
    label: 'Reciprocal',
    params: [],
    f: (z) => cdiv(ONE, z),
    fp: (z) => cdiv(cx(-1), cmul(z, z)),
    uniforms: () => NO_U,
    expr: (a, _p, compound) => `1 / ${par(a, compound)}`
  },
  {
    id: 'mobius',
    mode: 4,
    label: 'Möbius',
    params: [
      { kind: 'complex', id: 'k', label: 'k', range: 3, default: cx(1, 0) },
      { kind: 'complex', id: 'z0', label: 'zero z₀', range: 2.5, default: cx(-0.4, 0), draggable: true },
      { kind: 'complex', id: 'zi', label: 'pole z∞', range: 2.5, default: cx(0.4, 0), draggable: true }
    ],
    f: (z, p) => cmul(k(p, 'k'), cdiv(csub(z, k(p, 'z0')), csub(z, k(p, 'zi')))),
    fp: (z, p) => {
      // d/dz [k(z−z0)/(z−z∞)] = k(z0−z∞)/(z−z∞)²
      const d = csub(z, k(p, 'zi'));
      return cmul(k(p, 'k'), cdiv(csub(k(p, 'z0'), k(p, 'zi')), cmul(d, d)));
    },
    uniforms: (p) => ({ pr: [0, 0, 0, 0], pa: u2(k(p, 'k')), pb: u2(k(p, 'z0')), pc: u2(k(p, 'zi')) }),
    expr: (a, p, compound) => {
      const arg = par(a, compound || a !== 'z');
      const kv = k(p, 'k');
      const km = Math.abs(kv.re - 1) < 1e-9 && Math.abs(kv.im) < 1e-9 ? '' : `(${fmtComplex(kv)})·`;
      return `${km}(${sub(arg, k(p, 'z0'))}) / (${sub(arg, k(p, 'zi'))})`;
    }
  },
  {
    id: 'joukowski',
    mode: 5,
    label: 'Joukowski',
    params: [],
    f: (z) => cmul(cx(0.5), cadd(z, cdiv(ONE, z))),
    fp: (z) => cmul(cx(0.5), csub(ONE, cdiv(ONE, cmul(z, z)))),
    uniforms: () => NO_U,
    expr: (a, _p, compound) => {
      const arg = par(a, compound);
      return `½(${arg} + 1/${arg})`;
    }
  },
  {
    id: 'exp',
    mode: 6,
    label: 'Exponential',
    params: [],
    f: (z) => cexp(z),
    fp: (z) => cexp(z),
    uniforms: () => NO_U,
    expr: (a) => `exp(${a})`
  },
  {
    id: 'log',
    mode: 7,
    label: 'Logarithm',
    params: [],
    f: (z) => clog(z),
    fp: (z) => cdiv(ONE, z),
    uniforms: () => NO_U,
    expr: (a) => `log(${a})`
  },
  {
    id: 'escher',
    mode: 8,
    label: 'Escher zᵃ',
    params: [{ kind: 'real', id: 'k', label: 'k', min: 0, max: 1.5, step: 0.01, default: 0.3 }],
    f: (z, p) => cpow(z, cx(1, -r(p, 'k'))),
    fp: (z, p) => {
      const a = cx(1, -r(p, 'k'));
      return cmul(a, cpow(z, csub(a, ONE)));
    },
    uniforms: (p) => ({ ...NO_U, pr: [r(p, 'k'), 0, 0, 0] }),
    expr: (a, p, compound) => `${par(a, compound || a !== 'z')}^(1 − ${fmt(r(p, 'k'))}i)`
  },
  {
    id: 'sine',
    mode: 9,
    label: 'Sine',
    params: [],
    f: (z) => csin(z),
    fp: (z) => ccos(z),
    uniforms: () => NO_U,
    expr: (a) => `sin(${a})`
  },
  {
    id: 'tan',
    mode: 10,
    label: 'Tangent',
    params: [],
    f: (z) => cdiv(csin(z), ccos(z)),
    fp: (z) => cdiv(ONE, cmul(ccos(z), ccos(z))), // sec²z
    uniforms: () => NO_U,
    expr: (a) => `tan(${a})`
  },
  {
    id: 'sininv',
    mode: 11,
    label: 'sin(1/z)',
    params: [],
    f: (z) => csin(cdiv(ONE, z)),
    fp: (z) => {
      const inv = cdiv(ONE, z);
      return cmul(ccos(inv), cdiv(cx(-1), cmul(z, z))); // cos(1/z)·(−1/z²)
    },
    uniforms: () => NO_U,
    expr: (a) => `sin(1 / ${par(a, a !== 'z')})`
  }
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p])
);

/** Fresh copy of a preset's default params (so edits don't mutate the def). */
export function defaultParams(preset: Preset): Params {
  const out: Params = {};
  for (const d of preset.params) {
    out[d.id] = d.kind === 'real' ? d.default : { ...d.default };
  }
  return out;
}

export type FillMode = 'tile' | 'clamp' | 'mirror';
export type PanMode = 'domain' | 'output';

/** The full live-formula string, with the pan term composed in. */
export function formulaText(preset: Preset, p: Params, c: Complex, panMode: PanMode): string {
  const zero = Math.abs(c.re) < 1e-9 && Math.abs(c.im) < 1e-9;
  if (panMode === 'output') {
    const base = preset.expr('z', p, false);
    return zero ? `f(z) = ${base}` : `f(z) = ${base} + (${fmtComplex(c)})`;
  }
  const arg = zero ? 'z' : sub('z', { re: -c.re, im: -c.im }); // z − (−c) = z + c
  return `f(z) = ${preset.expr(arg, p, !zero)}`;
}
