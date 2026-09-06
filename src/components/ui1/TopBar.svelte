<script lang="ts">
  import Icon from './Icon.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import RecentMenu from './RecentMenu.svelte';
  import InfoModal from './InfoModal.svelte';
  import Gallery from './Gallery.svelte';
  import RenameModal from './RenameModal.svelte';
  import {
    ui, doc, setImage, commitNewRect, animateShapeMorph,
    setThemeOverride, readThemeOverride, systemTheme
  } from '../../lib/ui1/state.svelte';
  import { loadFile } from '../../lib/ui1/file';
  import { addToHistory } from '../../lib/ui1/history.svelte';
  import {
    markCreate,
    currentTententoon,
    renameTententoon,
    performUndo,
    performRedo,
    markGestureEnd
  } from '../../lib/ui1/tententoon.svelte';
  import { undoState } from '../../lib/ui1/undo.svelte';
  import { putBlob, requestPersistentStorage } from '../../lib/ui1/persistence';

  type Props = {
    canvas: HTMLCanvasElement | null;
    renderFrame: (off: HTMLCanvasElement, t: number) => Promise<void> | void;
  };
  let { canvas, renderFrame }: Props = $props();

  let input: HTMLInputElement;
  let infoOpen = $state(false);
  let galleryOpen = $state(false);
  let renameOpen = $state(false);

  // Reactive — read undoState deps so the buttons re-render on stack changes.
  const undoOk = $derived(undoState.pointer > 0);
  const redoOk = $derived(undoState.pointer >= 0 && undoState.pointer < undoState.stack.length - 1);

  function saveCurrentName(name: string) {
    if (currentTententoon.id) renameTententoon(currentTententoon.id, name);
    renameOpen = false;
  }

  function reset() {
    // Zero rect → commitNewRect also nulls doc.crop so the working
    // frame returns to "none" alongside the rect.
    commitNewRect({ x: 0, y: 0, w: 0, h: 0 });
  }

  // Toggle the frame shape between rectangle and inscribed ellipse. The
  // drag box + handles are identical either way; only the mask/outline and
  // the nested-Droste windows change. markGestureEnd persists + records an
  // undo step (shape is part of the tententoon snapshot).
  function toggleShape() {
    doc.shape = doc.shape === 'rect' ? 'ellipse' : 'rect';
    animateShapeMorph(); // ease the circle↔rectangle morph instead of jumping
    markGestureEnd();
  }

  async function replace() {
    input.click();
  }

  async function onFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const r = await loadFile(file);
    if (r.ok) {
      void requestPersistentStorage();
      try {
        const hash = await putBlob(file);
        setImage(r.image, r.name);
        markCreate({ kind: 'blob', hash });
        void addToHistory(file, r.image, r.name);
      } catch {
        if (doc.image !== r.image) r.image.close();
        ui.exportToast = 'Could not save this photo in your browser. Free some device space and try again.';
      }
    } else {
      ui.exportToast = r.reason;
    }
  }

  // Theme toggle. Three-state cycle: system → light → dark → system.
  // The button icon reflects the *current effective* theme (sun =
  // light, moon = dark); a small dot indicates we're tracking the OS.
  const isDark = $derived(ui.theme === 'dark-warm');
  const followsSystem = $derived.by(() => {
    void ui.theme;  // re-read on theme changes so the dot stays in sync
    return readThemeOverride() === null;
  });
  function cycleTheme() {
    const override = readThemeOverride();
    if (override === null) {
      // Currently following OS — pin to the *opposite* of the current
      // OS pref so the click is visibly effective.
      setThemeOverride(systemTheme() === 'dark' ? 'light' : 'dark');
    } else if (override === 'light') {
      setThemeOverride('dark');
    } else {
      setThemeOverride(null);
    }
  }
  function themeTitle(): string {
    if (followsSystem) return `Theme: auto (${systemTheme()}) — click for light`;
    return isDark ? 'Theme: dark — click for auto' : 'Theme: light — click for dark';
  }
</script>

<header class="top">
  <button
    class="brand"
    onclick={() => (infoOpen = true)}
    title="About tententoon"
    aria-label="About tententoon"
  >
    <span class="logo">t</span>
    <span class="name">tententoon</span>
  </button>
  <span class="div"></span>
  {#if doc.image}
    <button
      class="file rename-btn"
      onclick={() => (renameOpen = true)}
      disabled={!currentTententoon.id}
      title={currentTententoon.id ? 'Rename' : ''}
      aria-label="Rename tententoon"
    >
      <Icon name="image" size={14} />
      <span class="fname">{currentTententoon.name || doc.imageName || 'image'}</span>
      <span class="dim mono">· {doc.image.width}×{doc.image.height}</span>
    </button>
  {:else}
    <span class="file empty">{currentTententoon.name || 'Untitled · no image'}</span>
  {/if}
  <span class="grow"></span>
  <button
    class="btn ghost icon-only"
    onclick={() => (infoOpen = true)}
    title="About tententoon"
    aria-label="About tententoon"
  >
    <Icon name="info" size={14} />
  </button>
  <button
    class="btn ghost icon-only theme-toggle"
    class:auto={followsSystem}
    onclick={cycleTheme}
    title={themeTitle()}
    aria-label="Toggle theme"
  >
    <Icon name={isDark ? 'moon' : 'sun'} size={14} />
  </button>
  <button
    class="btn ghost compactable"
    onclick={() => (galleryOpen = true)}
    title="Gallery"
    aria-label="Gallery"
  >
    <Icon name="gallery" size={14} /><span class="lbl">Gallery</span>
  </button>
  <button
    class="btn ghost icon-only"
    onclick={performUndo}
    disabled={!undoOk}
    title="Undo (⌘Z)"
    aria-label="Undo"
  >
    <Icon name="undo" size={14} />
  </button>
  <button
    class="btn ghost icon-only"
    onclick={performRedo}
    disabled={!redoOk}
    title="Redo (⇧⌘Z)"
    aria-label="Redo"
  >
    <Icon name="redo" size={14} />
  </button>
  <button
    class="btn ghost icon-only"
    onclick={toggleShape}
    disabled={!doc.image}
    title={doc.shape === 'ellipse' ? 'Shape: ellipse — click for rectangle' : 'Shape: rectangle — click for ellipse'}
    aria-label="Toggle selection shape"
  >
    <Icon name={doc.shape === 'ellipse' ? 'ellipse' : 'rect'} size={14} />
  </button>
  <button class="btn ghost compactable" onclick={reset} disabled={!doc.image} title="Reset rectangle" aria-label="Reset rectangle">
    <Icon name="reset" size={14} /><span class="lbl">Reset</span>
  </button>
  <RecentMenu />
  <button class="btn compactable" onclick={replace} title="Replace image" aria-label="Replace image">
    <Icon name="upload" size={14} /><span class="lbl">Replace</span>
  </button>
  <input
    bind:this={input}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
    onchange={(e) => onFile((e.currentTarget as HTMLInputElement).files)}
  />
  <div class="exp-wrap">
    <button
      class="btn primary compactable"
      onclick={() => (ui.exportMenuOpen = !ui.exportMenuOpen)}
      disabled={!doc.image}
      aria-label="Export"
      title="Export"
    >
      <Icon name="download" size={14} /><span class="lbl">Export</span>
      <span class="caret"><Icon name="caret" size={12} /></span>
    </button>
    <ExportMenu {canvas} {renderFrame} />
  </div>
</header>

<InfoModal open={infoOpen} onClose={() => (infoOpen = false)} />
<Gallery open={galleryOpen} onClose={() => (galleryOpen = false)} />
<RenameModal
  open={renameOpen}
  initial={currentTententoon.name}
  onClose={() => (renameOpen = false)}
  onSave={saveCurrentName}
/>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
    /* visible so the Export dropdown (position: absolute inside .exp-wrap)
       can render below the header instead of being clipped to it. */
    overflow: visible;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 0;
    padding: 4px 4px 4px 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: 6px;
  }
  .brand:hover { background: var(--panel-2); }
  .brand:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .logo {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    font-size: 13px;
  }
  .name { font-size: 13px; font-weight: 600; }
  .div { width: 1px; height: 18px; background: var(--border); }
  .file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .file.empty { color: var(--muted); }
  .rename-btn {
    background: transparent;
    border: 1px solid transparent;
    padding: 4px 8px;
    margin: 0;
    border-radius: 7px;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }
  .rename-btn:hover:not(:disabled) {
    background: var(--panel-2);
    border-color: var(--border);
  }
  .rename-btn:disabled { cursor: default; }
  .fname { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--muted); font-size: 11px; }
  .mono { font-family: var(--font-mono); }
  .grow { flex: 1; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    border-radius: 7px;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--border);
  }
  .btn:hover:not(:disabled) { background: var(--panel-2); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.ghost { background: transparent; border-color: transparent; }
  .btn.ghost:hover:not(:disabled) { background: var(--panel-2); }
  .btn.icon-only { padding: 5px 7px; gap: 0; }
  .theme-toggle {
    position: relative;
    color: var(--ink-2);
  }
  .theme-toggle:hover:not(:disabled) { color: var(--ink); }
  /* Tiny dot indicates "following the OS" — distinguishes from an
     explicit override that happens to match the system. */
  .theme-toggle.auto::after {
    content: '';
    position: absolute;
    bottom: 4px;
    right: 5px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
  }
  .btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 1px 0 rgba(0,0,0,0.05);
  }
  .btn.primary:hover:not(:disabled) {
    background: var(--accent);
    filter: brightness(1.08);
  }
  .caret { opacity: 0.7; margin-left: 2px; display: inline-flex; }
  .exp-wrap { position: relative; }

  /* Narrow viewports: collapse to icon-only buttons so the header
     actions stop falling off the right edge. Export also collapses —
     the download icon + caret reads as "export menu" once the row is
     all icons. */
  @media (max-width: 720px) {
    .top { gap: 6px; padding: 8px 10px; }
    .div { display: none; }
    .dim { display: none; }
    .fname { max-width: 140px; }
    .compactable .lbl { display: none; }
    .compactable { padding: 5px 7px; gap: 0; }
  }
  /* Phone-portrait ≤ 420 px: drop the wordmark too — the logo alone
     is enough chrome, and we need every pixel for the action row. */
  @media (max-width: 420px) {
    .name { display: none; }
    .fname { max-width: 110px; }
  }
  /* Below ~390 px the four actions + the file chip can't co-exist on
     one row even at minimum widths. Wrap to two rows: brand and file
     on top, actions below, separated by a zero-height .grow as the
     row break. Header grows ~36 px taller, all controls reachable. */
  @media (max-width: 400px) {
    .top {
      flex-wrap: wrap;
      align-items: center;
      padding: 6px 8px;
      overflow: visible;
    }
    .grow { flex-basis: 100%; height: 0; }
    .fname { max-width: 200px; }
    .file { display: none; }
  }
  /* Bigger touch targets on coarse pointers (phones / tablets).
     Apple HIG asks for 44; we land on 40 because the header bar is
     finite and 44 forces a taller bar that eats into the canvas. */
  @media (pointer: coarse) {
    .btn { padding: 8px 12px; }
    .btn.icon-only { padding: 8px 10px; }
  }
</style>
