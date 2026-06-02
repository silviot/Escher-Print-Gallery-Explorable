/**
 * Complex-playground state. Independent of the Droste `doc.rect`/`crop`; the
 * playground only borrows `doc.image` as its source texture. A light rune the
 * stage (renderer) and controls (UI) both read.
 */

import {
  PRESET_BY_ID,
  defaultParams,
  type Complex,
  type FillMode,
  type PanMode,
  type Params
} from '../render/playground/presets';

const DEFAULT_PRESET = 'escher';

export const playground = $state<{
  presetId: string;
  params: Params;
  /** Pan constant fed by hand-drag; composed per `panMode`. */
  c: Complex;
  panMode: PanMode;
  /** 1 = whole image fits the view; > 1 zooms in. */
  zoom: number;
  fill: FillMode;
}>({
  presetId: DEFAULT_PRESET,
  params: defaultParams(PRESET_BY_ID[DEFAULT_PRESET]),
  c: { re: 0, im: 0 },
  panMode: 'domain',
  zoom: 1,
  fill: 'tile'
});

/** Switch presets, loading that preset's default params and clearing the pan. */
export function selectPreset(id: string): void {
  const p = PRESET_BY_ID[id];
  if (!p) return;
  playground.presetId = id;
  playground.params = defaultParams(p);
  playground.c = { re: 0, im: 0 };
}

/** Back to the current preset's defaults (params + pan + zoom). */
export function resetPlayground(): void {
  const p = PRESET_BY_ID[playground.presetId];
  playground.params = defaultParams(p);
  playground.c = { re: 0, im: 0 };
  playground.zoom = 1;
}

/** True when anything is off the current preset's defaults — zoom, pan, OR
 *  any parameter (a slider nudge or a dragged Möbius zero/pole counts). */
export function playgroundDirty(): boolean {
  if (playground.zoom !== 1 || playground.c.re !== 0 || playground.c.im !== 0) return true;
  const defs = defaultParams(PRESET_BY_ID[playground.presetId]);
  for (const id in defs) {
    const cur = playground.params[id];
    const def = defs[id];
    if (typeof def === 'number') {
      if (cur !== def) return true;
    } else {
      const c = cur as Complex;
      if (c.re !== def.re || c.im !== def.im) return true;
    }
  }
  return false;
}
