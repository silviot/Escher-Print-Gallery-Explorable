import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  PRESET_BY_ID,
  defaultParams,
  formulaText,
  cx,
  type Complex,
  type Preset
} from '../../src/lib/render/playground/presets';

/** Approx-equal for a complex value. */
function near(a: Complex, re: number, im: number) {
  expect(a.re).toBeCloseTo(re, 6);
  expect(a.im).toBeCloseTo(im, 6);
}

const P = (id: string): Preset => PRESET_BY_ID[id];
const evalF = (id: string, z: Complex) => P(id).f(z, defaultParams(P(id)));

describe('playground presets — registry', () => {
  it('modes are 0..N-1, contiguous and unique (must match the shader switch)', () => {
    const modes = PRESETS.map((p) => p.mode).sort((a, b) => a - b);
    expect(modes).toEqual(PRESETS.map((_, i) => i));
    expect(new Set(modes).size).toBe(modes.length);
  });

  it('defaultParams returns a fresh clone (no shared references with the def)', () => {
    const m = P('mobius');
    const a = defaultParams(m);
    const b = defaultParams(m);
    (a.z0 as Complex).re = 99;
    expect((b.z0 as Complex).re).not.toBe(99); // clones are independent
    expect((m.params.find((d) => d.id === 'z0') as { default: Complex }).default.re).not.toBe(99);
  });

  it('every preset packs finite uniforms from its defaults', () => {
    for (const p of PRESETS) {
      const u = p.uniforms(defaultParams(p));
      for (const v of [...u.pr, ...u.pa, ...u.pb, ...u.pc]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('playground presets — f(z) correctness (CPU mirror of the shader)', () => {
  it('identity: f(z) = z', () => near(evalF('identity', cx(2, 3)), 2, 3));
  it('square: f(2i) = -4', () => near(evalF('square', cx(0, 2)), -4, 0));
  it('power n=3 default: f(2) = 8', () => near(evalF('power', cx(2, 0)), 8, 0));
  it('reciprocal: f(2) = 0.5', () => near(evalF('recip', cx(2, 0)), 0.5, 0));
  it('mobius default (z+0.4)/(z-0.4): f(0) = -1', () => near(evalF('mobius', cx(0, 0)), -1, 0));
  it('joukowski: f(i) = 0', () => near(evalF('joukowski', cx(0, 1)), 0, 0));
  it('joukowski: f(1) = 1', () => near(evalF('joukowski', cx(1, 0)), 1, 0));
  it('exp: f(0) = 1', () => near(evalF('exp', cx(0, 0)), 1, 0));
  it('log: f(1) = 0', () => near(evalF('log', cx(1, 0)), 0, 0));
  it('escher k=0 ⇒ a=1 ⇒ identity', () => {
    const p = P('escher');
    near(p.f(cx(2, 3), { k: 0 }), 2, 3);
  });
  it('sine: f(π/2) = 1', () => near(evalF('sine', cx(Math.PI / 2, 0)), 1, 0));
  it('tan: f(0) = 0', () => near(evalF('tan', cx(0, 0)), 0, 0));
  it('sin(1/z): f(2/π) = sin(π/2) = 1', () => near(evalF('sininv', cx(2 / Math.PI, 0)), 1, 0));

  it("mobius f' sign: f'(0) = k(z0−z∞)/(z−z∞)² = -5 for defaults", () => {
    const m = P('mobius');
    near(m.fp(cx(0, 0), defaultParams(m)), -5, 0);
  });
});

describe('playground presets — live formula text', () => {
  it('output pan, c = 0: bare f(z)', () => {
    expect(formulaText(P('square'), {}, cx(0, 0), 'output')).toBe('f(z) = z²');
    expect(formulaText(P('recip'), {}, cx(0, 0), 'output')).toBe('f(z) = 1 / z');
  });

  it('output pan composes "+ (c)"', () => {
    expect(formulaText(P('square'), {}, cx(0.5, 0), 'output')).toBe('f(z) = z² + (0.5)');
    expect(formulaText(P('square'), {}, cx(0.5, -0.2), 'output')).toBe('f(z) = z² + (0.5 − 0.2i)');
  });

  it('domain pan substitutes z → z + c inside f, folding the sign', () => {
    // domain mode shows f(z + c): c = 0.5 renders as "z + 0.5" inside f.
    expect(formulaText(P('square'), {}, cx(0.5, 0), 'domain')).toBe('f(z) = (z + 0.5)²');
    expect(formulaText(P('recip'), {}, cx(-0.5, 0), 'domain')).toBe('f(z) = 1 / (z − 0.5)');
  });

  it('escher shows its exponent a = 1 − ki', () => {
    expect(formulaText(P('escher'), { k: 0.3 }, cx(0, 0), 'output')).toBe('f(z) = z^(1 − 0.3i)');
  });

  it('new presets render their notation', () => {
    expect(formulaText(P('tan'), {}, cx(0, 0), 'output')).toBe('f(z) = tan(z)');
    expect(formulaText(P('sininv'), {}, cx(0, 0), 'output')).toBe('f(z) = sin(1 / z)');
    expect(formulaText(P('sininv'), {}, cx(0.5, 0), 'domain')).toBe('f(z) = sin(1 / (z + 0.5))');
  });
});
