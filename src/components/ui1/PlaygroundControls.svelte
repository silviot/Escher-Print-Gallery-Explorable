<script lang="ts">
  /**
   * Control strip for the complex playground (replaces the playback Timeline
   * in that view). Preset shelf · auto-generated parameter controls · pan-mode
   * toggle · fill mode · zoom · reset · quick-load (sample / patterns).
   *
   * Controls are generated from the active preset's param schema, so adding a
   * preset in presets.ts wires its sliders automatically.
   */

  import { doc, setImage } from '../../lib/ui1/state.svelte';
  import {
    playground,
    selectPreset,
    resetPlayground,
    playgroundDirty
  } from '../../lib/ui1/playground.svelte';
  import { PRESETS, PRESET_BY_ID, type Complex, type FillMode } from '../../lib/render/playground/presets';
  import { makeTestPattern, type PatternKind } from '../../lib/ui1/test-patterns';
  import { loadUrl } from '../../lib/ui1/file';
  import { publicAssetUrl } from '../../lib/asset-url';

  const preset = $derived(PRESET_BY_ID[playground.presetId]);
  const FILLS: FillMode[] = ['tile', 'clamp', 'mirror'];

  function setReal(id: string, v: number) {
    playground.params[id] = v;
  }
  function setCplx(id: string, part: 're' | 'im', v: number) {
    const cur = playground.params[id] as Complex;
    playground.params[id] = { ...cur, [part]: v };
  }

  async function loadSample() {
    const r = await loadUrl(publicAssetUrl('Droste_1260359-nevit.jpg'));
    if (r.ok) setImage(r.image, r.name);
  }
  async function loadPattern(kind: PatternKind) {
    const bmp = await makeTestPattern(kind);
    setImage(bmp, kind === 'polar' ? 'Polar grid' : 'Cartesian grid');
  }
</script>

<div class="controls">
  <span class="tag">complex playground</span>

  <!-- preset shelf -->
  <div class="shelf">
    {#each PRESETS as p}
      <button
        class="chip"
        class:active={playground.presetId === p.id}
        onclick={() => selectPreset(p.id)}
        title={p.label}
      >{p.label}</button>
    {/each}
  </div>

  <span class="sep"></span>

  <!-- per-preset params -->
  {#if preset && preset.params.length > 0}
    {#each preset.params as def}
      {#if def.kind === 'real'}
        <label class="ctl">
          <span class="lbl">{def.label}</span>
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={playground.params[def.id] as number}
            oninput={(e) => setReal(def.id, +(e.currentTarget as HTMLInputElement).value)}
          />
          <span class="val mono">{(playground.params[def.id] as number).toFixed(2)}</span>
        </label>
      {:else}
        <span class="ctl cplx">
          <span class="lbl">{def.label}{def.draggable ? ' ✥' : ''}</span>
          <input
            class="num mono"
            type="number"
            step="0.05"
            value={(playground.params[def.id] as Complex).re}
            oninput={(e) => setCplx(def.id, 're', +(e.currentTarget as HTMLInputElement).value)}
          />
          <span class="i mono">+</span>
          <input
            class="num mono"
            type="number"
            step="0.05"
            value={(playground.params[def.id] as Complex).im}
            oninput={(e) => setCplx(def.id, 'im', +(e.currentTarget as HTMLInputElement).value)}
          />
          <span class="i mono">i</span>
        </span>
      {/if}
    {/each}
    <span class="sep"></span>
  {/if}

  <!-- pan composition -->
  <span class="lbl">drag adds c:</span>
  <div class="seg">
    <button class="segbtn" class:active={playground.panMode === 'domain'} onclick={() => (playground.panMode = 'domain')} title="f(z + c)">f(z+c)</button>
    <button class="segbtn" class:active={playground.panMode === 'output'} onclick={() => (playground.panMode = 'output')} title="f(z) + c">f(z)+c</button>
  </div>

  <span class="sep"></span>

  <!-- fill -->
  <span class="lbl">fill</span>
  <div class="seg">
    {#each FILLS as f}
      <button class="segbtn" class:active={playground.fill === f} onclick={() => (playground.fill = f)}>{f}</button>
    {/each}
  </div>

  <span class="sep"></span>

  <!-- zoom -->
  <label class="ctl">
    <span class="lbl">zoom</span>
    <input
      type="range" min="0.2" max="8" step="0.05"
      value={playground.zoom}
      oninput={(e) => (playground.zoom = +(e.currentTarget as HTMLInputElement).value)}
    />
    <span class="val mono">{playground.zoom.toFixed(2)}×</span>
  </label>

  <button class="btn ghost" onclick={resetPlayground} disabled={!playgroundDirty()}>reset</button>

  <span class="sep"></span>

  <!-- quick-load image sources -->
  <span class="lbl">image</span>
  <button class="btn" onclick={loadSample}>sample</button>
  <button class="btn" onclick={() => loadPattern('polar')}>polar</button>
  <button class="btn" onclick={() => loadPattern('grid')}>grid</button>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 12px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--ink-2);
    max-height: 38vh;
    overflow-y: auto;
  }
  .tag {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    font-weight: 600;
  }
  .shelf { display: flex; flex-wrap: wrap; gap: 4px; }
  .ctl { display: inline-flex; align-items: center; gap: 6px; }
  .cplx { gap: 3px; }
  .lbl { color: var(--muted); white-space: nowrap; }
  .val { min-width: 44px; color: var(--ink); }
  input[type='range'] { width: 120px; accent-color: var(--accent); }
  .num {
    width: 52px;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--ink);
  }
  .i { color: var(--muted); }
  .sep { width: 1px; height: 18px; background: var(--border); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .segbtn {
    font: inherit;
    font-size: 11px;
    padding: 4px 8px;
    border: none;
    background: var(--panel-2);
    color: var(--ink-2);
    cursor: pointer;
  }
  .segbtn + .segbtn { border-left: 1px solid var(--border); }
  .segbtn.active { background: var(--accent); color: #fff; }
  .chip {
    font: inherit;
    font-size: 12px;
    padding: 4px 9px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover { background: var(--accent-soft); }
  .chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 9px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--ink);
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--accent-soft); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.ghost { background: transparent; }
  .mono { font-family: var(--font-mono); }
  @media (max-width: 720px) {
    .controls { gap: 7px; padding: 7px 8px; }
    input[type='range'] { width: 90px; }
  }
</style>
