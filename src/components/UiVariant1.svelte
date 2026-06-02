<script lang="ts">
  /**
   * UI variant 1 — Approach C "Tool App".
   *
   * Layout: top bar · left tool rail · canvas stage · right inspector ·
   * bottom timeline. Matches the design in assets/hifi/screens.jsx.
   *
   * State lives in src/lib/ui1/state.svelte.ts (ui / doc / playback runes).
   * The renderer is the project's existing tier-aware GPU spiral pipeline.
   * Exports (PNG / video / GIF) go through src/lib/ui1/exports/*.
   *
   * Reachable at `/ui1`. Independent from the main view's stores so the
   * two variants don't fight over state.
   */

  import './ui1/tokens.css';
  import TopBar from './ui1/TopBar.svelte';
  import ToolRail from './ui1/ToolRail.svelte';
  import CanvasStage from './ui1/CanvasStage.svelte';
  import PreviewStage from './ui1/PreviewStage.svelte';
  import DrosteStage from './ui1/DrosteStage.svelte';
  import PipelinePanel from './ui1/PipelinePanel.svelte';
  import PipelineControls from './ui1/PipelineControls.svelte';
  import PlaygroundStage from './ui1/PlaygroundStage.svelte';
  import PlaygroundControls from './ui1/PlaygroundControls.svelte';
  import Timeline from './ui1/Timeline.svelte';
  import DropZone from './ui1/DropZone.svelte';
  import {
    ui, doc, playback, commitTranslate,
    applyTheme, readThemeOverride
  } from '../lib/ui1/state.svelte';
  import { loadHistory } from '../lib/ui1/history.svelte';
  import { phase } from '../lib/ui1/render';
  import { markGestureEnd, performUndo, performRedo } from '../lib/ui1/tententoon.svelte';
  import { setPreviewCanvas } from '../lib/ui1/thumb.svelte';

  // Plumbing the live canvas + a render-frame fn up to the export menu in
  // the top bar.
  //
  // Two render-frame bindings — one from the spiral (PreviewStage), one
  // from the regular Droste (DrosteStage). The view the user is *looking
  // at* is what they expect to export, so the active binding is selected
  // by ui.view at the moment Export/Share fires. Both stages stay mounted
  // (their bindings persist across view switches), so flipping between
  // them is just a $derived pick.
  let canvas = $state<HTMLCanvasElement | null>(null);
  // Hand the preview canvas to the thumbnail module so the gallery
  // can capture it after each autosave. The reactive read of `canvas`
  // keeps this in sync if the canvas is rebuilt (theme change, etc).
  $effect(() => {
    setPreviewCanvas(canvas);
  });
  const noopRender: (off: HTMLCanvasElement, t: number) => Promise<void> =
    async () => {};
  let previewRenderFrame = $state<(off: HTMLCanvasElement, t: number) => Promise<void>>(noopRender);
  let drosteRenderFrame = $state<(off: HTMLCanvasElement, t: number) => Promise<void>>(noopRender);
  const renderFrame = $derived(ui.view === 'droste' ? drosteRenderFrame : previewRenderFrame);

  // Keyboard shortcuts (HANDOFF §8): Space, [, ], ⌘E, Esc, arrows.
  function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (inField) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if (e.key === ' ') {
      if (phase() === 'edit' || phase() === 'playing') {
        e.preventDefault();
        playback.playing = !playback.playing;
        markGestureEnd();
      }
    } else if (e.key === '[') {
      playback.t = Math.max(0, playback.t - 0.02);
    } else if (e.key === ']') {
      playback.t = Math.min(1, playback.t + 0.02);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      ui.exportMenuOpen = !ui.exportMenuOpen;
    } else if (e.key === 'Escape') {
      ui.exportMenuOpen = false;
    } else if (doc.rect.w > 0 && doc.rect.h > 0) {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); commitTranslate({ ...doc.rect, x: doc.rect.x - step }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); commitTranslate({ ...doc.rect, x: doc.rect.x + step }); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); commitTranslate({ ...doc.rect, y: doc.rect.y - step }); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); commitTranslate({ ...doc.rect, y: doc.rect.y + step }); }
    }
  }

  $effect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Theme: apply the user's override (localStorage) or, absent that, the
  // OS preference. Listen for OS changes and re-apply when no override
  // is set so the editor flips with the system at runtime.
  $effect(() => {
    applyTheme();
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (!readThemeOverride()) applyTheme(); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  // Hydrate the Recent-tententoons history from IndexedDB on mount so
  // the menu in the TopBar can render its thumbnails right away.
  $effect(() => { void loadHistory(); });
</script>

<div class="ui1-root theme-{ui.theme}">
  <TopBar {canvas} {renderFrame} />
  <div class="body">
    <ToolRail {renderFrame} />
    {#if phase() === 'empty'}
      <section class="empty"><DropZone /></section>
    {:else}
      <div class="canvas-col">
        <!--
          Both stages stay mounted in every view mode — PreviewStage
          owns the renderFrame binding the export menu relies on, so
          unmounting it on `source` would break export-from-source.
          The `view-*` class hides the inactive stage with display:none,
          which also short-circuits PreviewStage's render effect via
          its 0×0 ResizeObserver readout.
        -->
        <div class="stages view-{ui.view}">
          <CanvasStage />
          <PreviewStage
            bindCanvas={(c) => (canvas = c)}
            bindRenderFrame={(fn) => (previewRenderFrame = fn)}
          />
          <DrosteStage bindRenderFrame={(fn) => (drosteRenderFrame = fn)} />
          <!--
            Pipeline-view derived panels. CanvasStage above is reused as the
            top-left rect editor; these three fill the rest of the 2×2 grid.
            Hidden (display:none → inert render effects) in every other view.
          -->
          <PipelinePanel kind="log" />
          <PipelinePanel kind="rotlog" />
          <PipelinePanel kind="escher" />
          <!--
            Complex playground: image warped by a chosen f(z). Own complex
            frame (not doc.rect); hidden in every other view.
          -->
          <PlaygroundStage />
        </div>
        {#if ui.view === 'pipeline'}
          <PipelineControls />
        {:else if ui.view === 'playground'}
          <PlaygroundControls />
        {:else}
          <Timeline />
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .ui1-root {
    display: flex;
    flex-direction: column;
    /* 100vh on iOS Safari includes the dynamic URL bar — the bottom
       playback strip slides below the visible viewport. dvh sizes to
       what's actually on screen and re-flows when the URL bar shows
       or hides. Fallback for older browsers stays at vh. */
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow-y: auto;
  }
  /* Phones: 32 px outer padding crowds a 360–390 viewport. Tighten and
     let the drop card hug the available width. */
  @media (max-width: 720px) {
    .empty { padding: 16px; }
    /* Flip the body to column so the ToolRail (now a horizontal bar)
       sits below the canvas. order: 1 pushes it under .canvas-col. */
    .body { flex-direction: column; }
    .body > :global(nav) { order: 1; }
  }
  .canvas-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .stages {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  /* View-mode visibility. CanvasStage renders as <section class="stage">,
     PreviewStage as <section class="preview">, DrosteStage as
     <section class="droste"> — hide the inactive ones by tag-class.
     `split` keeps the editor canvas + spiral; `preview` is spiral-only;
     `droste` is regular-Droste-only. */
  .stages :global(.droste) { display: none; }
  /* Pipeline's three derived panels are hidden in every non-pipeline view. */
  .stages :global(.ppanel) { display: none; }
  /* The complex playground stage is hidden in every non-playground view. */
  .stages :global(.playground-stage) { display: none; }
  .stages.view-preview :global(.stage) { display: none; }
  .stages.view-droste :global(.stage),
  .stages.view-droste :global(.preview) { display: none; }
  .stages.view-droste :global(.droste) { display: flex; }
  /* Pipeline: 2×2 grid. CanvasStage (.stage) is the top-left rect editor;
     the three .ppanel cells (log · rotated-log · tententoon) follow in DOM
     order to fill TR / BL / BR. The spiral + droste stages stay hidden. */
  .stages.view-pipeline {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .stages.view-pipeline :global(.preview),
  .stages.view-pipeline :global(.droste) { display: none; }
  .stages.view-pipeline :global(.stage) { display: flex; }
  .stages.view-pipeline :global(.ppanel) { display: flex; }
  /* Playground: single full-bleed stage; hide the editor/spiral/droste. */
  .stages.view-playground :global(.stage),
  .stages.view-playground :global(.preview),
  .stages.view-playground :global(.droste) { display: none; }
  .stages.view-playground :global(.playground-stage) { display: flex; }
  /* Narrow viewports: stack the four panels in a single column. */
  @media (max-width: 640px) {
    .stages.view-pipeline {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, 1fr);
    }
  }
  /* Stack the split view vertically only when the viewport is *both*
     narrow AND portrait — phones in landscape have horizontal room
     and side-by-side reads fine there. Stacking on a 844×390 phone
     landscape would squeeze each stage to ~120 px tall, which is
     unusable for cropping. */
  @media (orientation: portrait) and (max-width: 900px) {
    .stages.view-split { flex-direction: column; }
  }
  /* Pure-narrow fallback for very small windows (devtools-open
     desktop) where orientation may not be reported reliably. */
  @media (max-width: 640px) {
    .stages.view-split { flex-direction: column; }
  }
</style>
