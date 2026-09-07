<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, doc, playback, isDrosteView } from '../../lib/ui1/state.svelte';
  import { exportPng } from '../../lib/ui1/exports/png';
  import { exportVideo } from '../../lib/ui1/exports/mp4';
  import { exportGif } from '../../lib/ui1/exports/gif';

  // Caller passes a per-frame render fn (which renders to ANY canvas at
  // a given progress t ∈ [0,1)). The MP4 export now drives a hidden
  // canvas with this fn — the live preview is no longer captured, so the
  // user can scrub / click during a recording without corrupting it.
  //
  // The renderFrame reflects the active view (spiral or droste), so the
  // PNG and video paths both honour what the user is looking at. The
  // spiral CPU pipeline only runs when ui.view is one of the tententoon
  // modes; Create and Droste forward renderFrame to png.ts.
  type Props = {
    canvas: HTMLCanvasElement | null;
    renderFrame: (off: HTMLCanvasElement, t: number) => Promise<void> | void;
  };
  let { renderFrame }: Props = $props();
  const useDroste = $derived(isDrosteView(ui.view));

  let busy = $state(false);
  // One progress channel for all export kinds — same modal, different labels.
  // null = idle.
  type ProgressKind = 'image' | 'video' | 'gif';
  let progress = $state<{ kind: ProgressKind; fraction: number } | null>(null);
  // Cancellation flag handed to whichever export is running.
  let cancelFlag: { cancelled: boolean } | null = null;

  async function doPng() {
    if (!doc.image || !doc.crop || busy) return;
    busy = true;
    ui.exportMenuOpen = false;
    progress = { kind: 'image', fraction: 0 };
    cancelFlag = { cancelled: false };
    playback.exporting = true;
    try {
      await exportPng(doc.image, doc.rect, doc.crop, {
        filename: basename('.png'),
        signal: cancelFlag,
        onProgress: (f) => { progress = { kind: 'image', fraction: f }; },
        ...(useDroste
          ? {
              renderFrame,
              t: playback.t,
              outputSize: { w: doc.image.width, h: doc.image.height }
            }
          : {})
      });
      ui.exportToast = 'Image saved.';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ui.exportToast = msg === 'cancelled' ? 'Export cancelled.' : `Image export failed: ${msg}`;
    } finally {
      progress = null;
      cancelFlag = null;
      busy = false;
      playback.exporting = false;
      hideToastAfter();
    }
  }

  async function doVideo() {
    if (!doc.image || busy) return;
    busy = true;
    ui.exportMenuOpen = false;
    progress = { kind: 'video', fraction: 0 };
    cancelFlag = { cancelled: false };
    playback.exporting = true;
    try {
      await exportVideo({
        imageWidth: doc.image.width,
        imageHeight: doc.image.height,
        loopSeconds: playback.loopLength,
        renderFrame,
        filenameBase: basename(''),
        signal: cancelFlag,
        onProgress: (p) => { progress = { kind: 'video', fraction: p.fraction }; }
      });
      ui.exportToast = 'Video saved.';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ui.exportToast = msg === 'cancelled' ? 'Export cancelled.' : `Video export failed: ${msg}`;
    } finally {
      progress = null;
      cancelFlag = null;
      busy = false;
      playback.exporting = false;
      hideToastAfter();
    }
  }

  async function doGif() {
    if (!doc.image || busy) return;
    busy = true;
    ui.exportMenuOpen = false;
    progress = { kind: 'gif', fraction: 0 };
    cancelFlag = { cancelled: false };
    playback.exporting = true;
    try {
      await exportGif({
        imageWidth: doc.image.width,
        imageHeight: doc.image.height,
        loopSeconds: playback.loopLength,
        renderFrame,
        filenameBase: basename(''),
        signal: cancelFlag,
        onProgress: (p) => { progress = { kind: 'gif', fraction: p.fraction }; }
      });
      ui.exportToast = 'GIF saved.';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ui.exportToast = msg === 'cancelled' ? 'Export cancelled.' : `GIF export failed: ${msg}`;
    } finally {
      progress = null;
      cancelFlag = null;
      busy = false;
      playback.exporting = false;
      hideToastAfter();
    }
  }

  function cancelExport() {
    if (cancelFlag) cancelFlag.cancelled = true;
  }

  function basename(ext: string): string {
    // Name the file after the active view (the kind of thing being
    // saved) rather than the source image. Keeps PNG/MP4 from inheriting
    // the original photograph's filename, which was misleading once the
    // output is a derived artefact, and self-labels the view.
    const stem = useDroste ? 'droste' : 'tententoon';
    return stem + ext;
  }

  function hideToastAfter() {
    setTimeout(() => {
      if (ui.exportToast) ui.exportToast = null;
    }, 4000);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') ui.exportMenuOpen = false;
  }

  $effect(() => {
    if (!ui.exportMenuOpen) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if ui.exportMenuOpen}
  <div class="menu" role="menu">
    <div class="header">SAVE AS</div>
    <button class="item" disabled={busy || !doc.image} onclick={doPng}>
      <span class="ic"><Icon name="image" size={14} /></span>
      <span class="text">
        <span class="t">Image</span>
        <span class="s">A {useDroste ? 'Droste' : 'tententoon'} of your picture · {doc.image?.width ?? 0}×{doc.image?.height ?? 0}</span>
      </span>
      <span class="dl"><Icon name="download" size={14} /></span>
    </button>
    <button class="item" disabled={busy || !doc.image} onclick={doVideo}>
      <span class="ic"><Icon name="film" size={14} /></span>
      <span class="text">
        <span class="t">Video</span>
        <span class="s">A looping zoom of a {useDroste ? 'Droste' : 'tententoon'} of your picture · {playback.loopLength.toFixed(0)}s</span>
      </span>
      <span class="dl"><Icon name="download" size={14} /></span>
    </button>
    <button class="item" disabled={busy || !doc.image} onclick={doGif}>
      <span class="ic"><Icon name="gif" size={14} /></span>
      <span class="text">
        <span class="t">Looping GIF</span>
        <span class="s">{playback.loopLength.toFixed(0)}s · 480px · 25fps</span>
      </span>
      <span class="dl"><Icon name="download" size={14} /></span>
    </button>
    <div class="rule"></div>
    <div class="foot">
      <span>Your image never leaves this device — it's yours, not ours.</span>
    </div>
  </div>
{/if}

<!--
  Modal overlay during an export. Blocks UI clicks (covers the page) so
  the user can't drift attention into something they expect to affect the
  output; shows live progress so they know it's working; offers a Cancel
  button. The actual rendering is happening off-screen, so user panics
  don't corrupt anything either way — this is purely a clarity affordance.
-->
{#if progress !== null}
  <div class="recording-mask" role="dialog" aria-modal="true" aria-label="Exporting {progress.kind}">
    <div class="recording-card">
      <div class="rec-title">Exporting {progress.kind}…</div>
      <div class="rec-bar" role="progressbar" aria-valuenow={Math.round(progress.fraction * 100)} aria-valuemin="0" aria-valuemax="100">
        <div class="rec-bar-fill" style:width="{(progress.fraction * 100).toFixed(1)}%"></div>
      </div>
      <div class="rec-text mono">
        {#if progress.kind === 'video'}
          {(progress.fraction * 100).toFixed(0)}% · {(progress.fraction * playback.loopLength).toFixed(1)}s / {playback.loopLength.toFixed(1)}s
        {:else}
          {(progress.fraction * 100).toFixed(0)}%
        {/if}
      </div>
      <button class="rec-cancel" onclick={cancelExport}>Cancel</button>
    </div>
  </div>
{/if}

{#if ui.exportToast}
  <div class="toast">{ui.exportToast}</div>
{/if}

<style>
  .menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    min-width: 280px;
    padding: 6px;
    z-index: 10;
  }
  /* Phones: convert the dropdown to a bottom sheet. */
  @media (max-width: 720px) {
    .menu {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      min-width: unset;
      margin-top: 0;
      border-radius: 14px 14px 0 0;
      padding: 10px 12px;
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.25);
    }
  }
  .header {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    padding: 6px 10px 4px;
    letter-spacing: 0.06em;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    border: 0;
    width: 100%;
    text-align: left;
    color: var(--ink);
    font: inherit;
  }
  .item:hover:not(:disabled) { background: var(--panel-2); }
  .item:disabled { opacity: 0.5; cursor: not-allowed; }
  .ic { color: var(--ink-2); display: inline-flex; }
  .text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .t { font-size: 13px; font-weight: 600; }
  .s { font-size: 11px; color: var(--muted); }
  .dl { color: var(--muted); display: inline-flex; }
  .rule { height: 1px; background: var(--border); margin: 6px 0; }
  .foot {
    padding: 4px 10px 6px;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.35;
  }
  .mono { font-family: var(--font-mono); }
  .recording-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .recording-card {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 20px 22px;
    min-width: min(320px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .rec-title { font-size: 14px; font-weight: 600; }
  .rec-bar {
    height: 8px;
    background: var(--panel-2);
    border-radius: 4px;
    overflow: hidden;
  }
  .rec-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 80ms linear;
  }
  .rec-text {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .rec-cancel {
    align-self: flex-end;
    padding: 5px 12px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-2);
    border: 1px solid var(--border);
  }
  .rec-cancel:hover { background: var(--panel-2); color: var(--ink); }
  .toast {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: var(--bg);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 100;
    box-shadow: var(--shadow);
  }
</style>
