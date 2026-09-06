<script lang="ts">
  /**
   * Experimental "geometry lab" control strip for the pipeline view (replaces
   * the playback Timeline there). Lets you:
   *   - override the rotation/twist angle γ (idea 3): the rotated-log tilts to
   *     γ and the tententoon's twist becomes k = tan γ. Only at the canonical
   *     β does the spiral close up with the Droste scale.
   *   - reset the pan written by dragging the rotated-log panel (idea 2).
   *   - load generated geometry test patterns (idea 1) without reimporting.
   */

  import { doc, setImage, commitNewRect } from '../../lib/ui1/state.svelte';
  import { buildPanelGeometry } from '../../lib/ui1/pipeline-panels';
  import { experiment, resetExperiment, experimentActive } from '../../lib/ui1/pipeline-experiments.svelte';
  import { makeTestPattern, patternNest, type PatternKind } from '../../lib/ui1/test-patterns';

  const geom = $derived.by(() => {
    if (!doc.image || doc.rect.w <= 0 || !doc.crop) return null;
    return buildPanelGeometry(doc.rect, doc.crop);
  });
  const betaDeg = $derived(geom ? (Math.atan2(geom.ctx.logS, 2 * Math.PI) * 180) / Math.PI : 0);
  const angleDeg = $derived(experiment.angleDeg ?? betaDeg);
  const panned = $derived(experiment.panU !== 0 || experiment.panV !== 0);

  async function loadPattern(kind: PatternKind) {
    const bmp = await makeTestPattern(kind);
    setImage(bmp, kind === 'polar' ? 'Polar grid' : 'Cartesian grid');
    commitNewRect(patternNest());
  }
</script>

<div class="controls">
  <span class="tag">geometry lab</span>

  <label class="ctl">
    <span class="lbl">rotation γ</span>
    <input
      type="range" min="0" max="45" step="0.5"
      value={angleDeg}
      oninput={(e) => (experiment.angleDeg = +(e.currentTarget as HTMLInputElement).value)}
      disabled={!geom}
    />
    <span class="val mono">{angleDeg.toFixed(1)}°</span>
  </label>
  <button
    class="btn"
    onclick={() => (experiment.angleDeg = null)}
    disabled={experiment.angleDeg === null}
    title="Snap back to the canonical β = atan(logS/2π)"
  >β = {betaDeg.toFixed(1)}°</button>

  <span class="sep"></span>

  <span class="hint mono">drag the rotated-log panel to pan</span>
  <button class="btn" onclick={() => { experiment.panU = 0; experiment.panV = 0; }} disabled={!panned}>
    reset pan
  </button>
  <button class="btn ghost" onclick={resetExperiment} disabled={!experimentActive()}>reset all</button>

  <span class="sep"></span>

  <span class="lbl">test pattern</span>
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
  }
  .tag {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    font-weight: 600;
  }
  .ctl { display: inline-flex; align-items: center; gap: 6px; }
  .lbl { color: var(--muted); }
  .val { min-width: 38px; color: var(--ink); }
  input[type='range'] { width: 150px; accent-color: var(--accent); }
  .sep { width: 1px; height: 18px; background: var(--border); }
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
  .hint { color: var(--muted); font-size: 11px; }
  .mono { font-family: var(--font-mono); }
  @media (max-width: 720px) {
    .controls { gap: 7px; padding: 7px 8px; }
    input[type='range'] { width: 110px; }
    .hint { display: none; }
  }
</style>
