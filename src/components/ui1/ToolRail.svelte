<script lang="ts">
  import Icon from './Icon.svelte';
  import ShareMenu from './ShareMenu.svelte';
  import { ui, doc, type ViewMode } from '../../lib/ui1/state.svelte';
  import { markGestureEnd } from '../../lib/ui1/tententoon.svelte';

  type Props = {
    renderFrame: (off: HTMLCanvasElement, t: number) => Promise<void> | void;
  };
  let { renderFrame }: Props = $props();

  function setView(view: ViewMode) {
    ui.view = view;
    markGestureEnd();
  }
</script>

<nav class="rail" aria-label="View">
  <button
    class="tool"
    class:active={ui.view === 'split'}
    aria-pressed={ui.view === 'split'}
    disabled={!doc.image}
    title="Edit frame · picture and spiral side by side"
    onclick={() => setView('split')}
  >
    <Icon name="viewSplit" />
    <span>Edit</span>
  </button>
  <button
    class="tool"
    class:active={ui.view === 'preview'}
    aria-pressed={ui.view === 'preview'}
    disabled={!doc.image}
    title="Tententoon · spiraling copies"
    onclick={() => setView('preview')}
  >
    <Icon name="viewPreview" />
    <span>Spiral</span>
  </button>
  <button
    class="tool"
    class:active={ui.view === 'droste'}
    aria-pressed={ui.view === 'droste'}
    disabled={!doc.image}
    title="Droste · nested copies"
    onclick={() => setView('droste')}
  >
    <Icon name="viewDroste" />
    <span>Droste</span>
  </button>
  <button
    class="tool"
    class:active={ui.view === 'pipeline'}
    aria-pressed={ui.view === 'pipeline'}
    disabled={!doc.image}
    title="Pipeline · see how the spiral is made"
    onclick={() => setView('pipeline')}
  >
    <Icon name="viewPipeline" />
    <span>Pipeline</span>
  </button>
  <button
    class="tool"
    class:active={ui.view === 'playground'}
    aria-pressed={ui.view === 'playground'}
    disabled={!doc.image}
    title="Complex playground · explore image transforms"
    onclick={() => setView('playground')}
  >
    <Icon name="viewPlayground" />
    <span>Playground</span>
  </button>
  <div class="spacer"></div>
  <!-- Self-hides on browsers without navigator.canShare for files. -->
  <ShareMenu {renderFrame} />
</nav>

<style>
  .rail {
    width: 88px;
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
  }
  .tool {
    width: 72px;
    min-height: 58px;
    flex-direction: column;
    gap: 5px;
    font: inherit;
    font-size: 11px;
    line-height: 1.2;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-2);
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .tool:disabled { opacity: 0.4; cursor: not-allowed; }
  .tool:hover:not(:disabled) { background: var(--panel-2); }
  .tool.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .spacer { flex: 1; }
  @media (max-height: 520px) and (min-width: 721px) {
    .rail { width: 108px; padding: 4px; gap: 2px; }
    .tool { width: 98px; min-height: 36px; flex-direction: row; gap: 6px; justify-content: flex-start; padding-inline: 8px; }
  }
  @media (max-width: 720px) {
    .rail {
      width: 100%;
      flex-direction: row;
      border-right: none;
      border-top: 1px solid var(--border);
      padding: 2px 6px;
      padding-bottom: max(2px, env(safe-area-inset-bottom));
      justify-content: center;
      gap: 2px;
    }
    .tool { flex: 1; min-width: 0; width: auto; min-height: 40px; font-size: 11px; gap: 0; }
    .tool :global(svg) { display: none; }
    .tool.active { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
    .spacer { display: none; }
  }
</style>
