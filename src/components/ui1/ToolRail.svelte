<script lang="ts">
  import Icon from './Icon.svelte';
  import ShareMenu from './ShareMenu.svelte';
  import { ui, type ViewMode } from '../../lib/ui1/state.svelte';
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
    title="Side-by-side view"
    aria-label="Side-by-side view"
    onclick={() => setView('split')}
  >
    <Icon name="viewSplit" />
  </button>
  <button
    class="tool"
    class:active={ui.view === 'preview'}
    title="tententoon"
    aria-label="tententoon"
    onclick={() => setView('preview')}
  >
    <Icon name="viewPreview" />
  </button>
  <button
    class="tool"
    class:active={ui.view === 'droste'}
    title="droste"
    aria-label="droste"
    onclick={() => setView('droste')}
  >
    <Icon name="viewDroste" />
  </button>
  <button
    class="tool"
    class:active={ui.view === 'pipeline'}
    title="Pipeline (log · rotated log · tententoon)"
    aria-label="Pipeline view"
    onclick={() => setView('pipeline')}
  >
    <Icon name="viewPipeline" />
  </button>
  <button
    class="tool"
    class:active={ui.view === 'playground'}
    title="Complex playground (f(z) explorer)"
    aria-label="Complex playground"
    onclick={() => setView('playground')}
  >
    <Icon name="viewPlayground" />
  </button>
  <div class="spacer"></div>
  <!-- Self-hides on browsers without navigator.canShare for files. -->
  <ShareMenu {renderFrame} />
</nav>

<style>
  .rail {
    width: 48px;
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
    width: 36px;
    height: 36px;
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
  .tool:hover { background: var(--panel-2); }
  .tool.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .spacer { flex: 1; }
  /* Touch viewports: bump the hit target to 40 px and widen the rail
     to match. 36 px is too small for thumbs and Apple HIG asks for
     more anyway. */
  @media (pointer: coarse) {
    .rail { width: 56px; padding: 8px 6px; }
    .tool { width: 44px; height: 44px; }
  }
  /* Narrow viewports: flip the rail to a horizontal bar below the canvas.
     Recovers ~48-56 px of canvas width — big win on 360 px phones.
     UiVariant1's .body flips to column to match. */
  @media (max-width: 720px) {
    .rail {
      width: 100%;
      flex-direction: row;
      border-right: none;
      border-top: 1px solid var(--border);
      padding: 6px 8px;
      justify-content: center;
      gap: 6px;
    }
    .tool { width: 40px; height: 40px; }
    .spacer { display: none; }
  }
</style>
