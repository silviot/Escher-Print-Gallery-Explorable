<script lang="ts">
  import Icon from './Icon.svelte';
  import { doc, ui, playback, commitNewRect, animateShapeMorph, type Shape } from '../../lib/ui1/state.svelte';
  import { markGestureEnd, performUndo, performRedo } from '../../lib/ui1/tententoon.svelte';
  import { undoState } from '../../lib/ui1/undo.svelte';

  const hasFrame = $derived(doc.rect.w > 0 && doc.rect.h > 0);

  function setShape(shape: Shape) {
    if (doc.shape === shape) return;
    doc.shape = shape;
    animateShapeMorph();
    markGestureEnd();
  }

  function redraw() {
    playback.playing = false;
    commitNewRect({ x: 0, y: 0, w: 0, h: 0 });
    ui.view = 'split';
    markGestureEnd();
  }
</script>

<div class="frame-toolbar" class:playground={ui.view === 'playground'}>
  {#if ui.view !== 'playground'}
    <div class="shape-group" role="group" aria-label="Frame shape">
      <span class="label">Frame shape</span>
      <div class="choices">
        <button class:active={doc.shape === 'rect'} aria-pressed={doc.shape === 'rect'} onclick={() => setShape('rect')} title="A rectangular frame for the next copy">
          <Icon name="rect" size={16} />Rectangle
        </button>
        <button class:active={doc.shape === 'ellipse'} aria-pressed={doc.shape === 'ellipse'} onclick={() => setShape('ellipse')} title="A round or oval frame for the next copy">
          <Icon name="ellipse" size={16} />Circle / oval
        </button>
      </div>
    </div>
    <span class="hint">{ui.view !== 'split' && ui.view !== 'pipeline' ? 'Choose Edit to adjust the frame on your picture.' : hasFrame ? 'Drag the frame to move it; drag its handles to resize.' : 'Drag on the picture to place the next copy.'}</span>
  {:else}
    <span class="label">Complex playground</span>
  {/if}
  <div class="edit-actions">
    {#if ui.view !== 'playground'}
      <button class="redraw" onclick={redraw} disabled={!hasFrame} title="Clear the frame and draw a new one on the picture" aria-label="Redraw frame">
        <Icon name="reset" size={14} /><span>Redraw<span class="desktop-word"> frame</span></span>
      </button>
    {/if}
    <div class="history" role="group" aria-label="Edit history">
      <button class="icon-only" onclick={performUndo} disabled={undoState.pointer <= 0} title="Undo (Ctrl/⌘Z)" aria-label="Undo">
        <Icon name="undo" size={16} />
      </button>
      <button class="icon-only" onclick={performRedo} disabled={undoState.pointer < 0 || undoState.pointer >= undoState.stack.length - 1} title="Redo (Ctrl/⌘Shift+Z)" aria-label="Redo">
        <Icon name="redo" size={16} />
      </button>
    </div>
  </div>
</div>

<style>
  .frame-toolbar { display: flex; align-items: center; gap: 16px; padding: 8px 16px; background: var(--panel); border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .shape-group, .choices, .edit-actions, .history { display: flex; align-items: center; gap: 8px; }
  .shape-group, .edit-actions { flex-shrink: 0; }
  .label { font-size: 12px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
  .choices { padding: 3px; gap: 2px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 9px; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 9px; border: 1px solid transparent; border-radius: 6px; font: inherit; font-size: 12px; color: var(--ink-2); white-space: nowrap; }
  button:hover:not(:disabled) { color: var(--ink); background: var(--panel-2); }
  button.active { background: var(--panel); color: var(--accent); border-color: var(--border-strong); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .hint { font-size: 12px; color: var(--ink-2); }
  .edit-actions { margin-left: auto; }
  .history { gap: 2px; padding-left: 8px; border-left: 1px solid var(--border); }
  .icon-only { width: 32px; padding: 0; }
  @media (max-width: 1100px) { .hint { display: none; } }
  @media (max-width: 720px) {
    .frame-toolbar { gap: 4px; padding: 4px 8px; }
    .shape-group { flex: 1; gap: 0; }
    .label, .desktop-word, .frame-toolbar.playground { display: none; }
    .choices { padding: 2px; }
    .choices button { min-height: 32px; padding-inline: 7px; }
    .choices button :global(svg), .redraw :global(svg) { display: none; }
    .edit-actions { gap: 2px; }
    .redraw { min-height: 36px; padding-inline: 4px; }
    .history { gap: 0; padding-left: 4px; }
    .icon-only { width: 30px; min-height: 36px; }
  }
</style>
