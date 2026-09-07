<script lang="ts">
  import Icon from './Icon.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import RecentMenu from './RecentMenu.svelte';
  import InfoModal from './InfoModal.svelte';
  import Gallery from './Gallery.svelte';
  import RenameModal from './RenameModal.svelte';
  import MobileMenu from './MobileMenu.svelte';
  import {
    ui, doc, setImage,
    setThemeOverride, readThemeOverride, systemTheme
  } from '../../lib/ui1/state.svelte';
  import { loadFile } from '../../lib/ui1/file';
  import { addToHistory } from '../../lib/ui1/history.svelte';
  import {
    markCreate,
    currentTententoon,
    renameTententoon
  } from '../../lib/ui1/tententoon.svelte';
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

  function saveCurrentName(name: string) {
    if (currentTententoon.id) renameTententoon(currentTententoon.id, name);
    renameOpen = false;
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
        ui.view = 'split';
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
    if (followsSystem) return `Theme: auto (${systemTheme()}) — click for ${systemTheme() === 'dark' ? 'light' : 'dark'}`;
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
      <Icon name="pencil" size={14} />
      <span class="fname">{currentTententoon.name || doc.imageName || 'image'}</span>
      <span class="dim mono">· {doc.image.width}×{doc.image.height}</span>
    </button>
  {:else}
    <span class="file empty">{currentTententoon.name || 'Untitled · no image'}</span>
  {/if}
  <div class="utilities">
    <RecentMenu />
    <button class="btn ghost icon-only" onclick={() => (infoOpen = true)} title="About tententoon" aria-label="About tententoon">
      <Icon name="info" size={16} />
    </button>
    <button class="btn ghost icon-only theme-toggle" class:auto={followsSystem} onclick={cycleTheme} title={themeTitle()} aria-label={themeTitle()}>
      <Icon name={isDark ? 'moon' : 'sun'} size={16} />
    </button>
  </div>
  <div class="actions">
    <div class="picture-picker">
      <button class="btn choose" onclick={() => input.click()} title="Choose a picture from your device">
        <Icon name="image" size={16} /><span>Choose picture</span>
      </button>
      <MobileMenu label="Choose picture" description="Choose a picture source" start accent>
        {#snippet children(close)}
          <button class="menu-action" onclick={() => { close(); input.click(); }}><Icon name="image" />From your device</button>
          <button class="menu-action" onclick={() => { close(); galleryOpen = true; }}><Icon name="gallery" />Gallery</button>
          <RecentMenu expandedLabel onPick={close} />
        {/snippet}
      </MobileMenu>
    </div>
    <button class="btn gallery-btn" onclick={() => (galleryOpen = true)} title="Open your saved tententoons">
      <Icon name="gallery" size={16} /><span>Gallery</span>
    </button>
    <div class="mobile-actions">
      <button class="btn icon-only" disabled={!currentTententoon.id} onclick={() => (renameOpen = true)} title="Rename picture" aria-label="Rename picture">
        <Icon name="pencil" size={16} /><span>Rename</span>
      </button>
      <button class="btn icon-only theme-toggle" class:auto={followsSystem} onclick={cycleTheme} title={themeTitle()} aria-label={themeTitle()}>
        <Icon name={isDark ? 'moon' : 'sun'} size={16} /><span>Theme</span>
      </button>
      <button class="btn icon-only" onclick={() => (infoOpen = true)} title="About tententoon" aria-label="About tententoon">
        <Icon name="info" size={16} /><span>About</span>
      </button>
    </div>
    <div class="exp-wrap">
      <button
        class="btn primary"
        onclick={() => (ui.exportMenuOpen = !ui.exportMenuOpen)}
        disabled={!doc.image || !doc.crop}
        aria-expanded={ui.exportMenuOpen}
        title={doc.crop ? 'Export an image, video, or GIF' : 'Draw a frame on the picture before exporting'}
      >
        <Icon name="download" size={16} /><span>Export</span>
        <span class="caret"><Icon name="caret" size={12} /></span>
      </button>
      <ExportMenu {canvas} {renderFrame} />
    </div>
  </div>
  <input
    bind:this={input}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
    onchange={(e) => { void onFile(e.currentTarget.files); e.currentTarget.value = ''; }}
  />
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
    padding: 10px 16px;
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
    flex: 1;
    min-width: 0;
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
  .utilities, .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .picture-picker { display: contents; }
  .btn.choose { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    white-space: nowrap;
    padding: 7px 10px;
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
  .btn.icon-only { width: 36px; padding: 0; justify-content: center; gap: 0; }
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
  .mobile-actions { display: none; }

  /* Group picture sources separately from name and appearance settings. */
  @media (max-width: 1000px) {
    .dim { display: none; }
    .fname { max-width: 160px; }
  }
  @media (max-width: 720px) {
    .top { gap: 0; padding: 4px 8px; }
    .brand, .div, .file, .utilities, .gallery-btn, .choose { display: none; }
    .actions { width: 100%; gap: 8px; }
    .picture-picker { display: block; margin-right: auto; }
    .mobile-actions { display: flex; gap: 2px; }
    .mobile-actions .btn { width: 32px; background: transparent; border-color: transparent; }
    .mobile-actions span { display: none; }
    .btn { min-height: 40px; }
    .caret { display: none; }
  }
  @media (min-width: 480px) and (max-width: 720px) {
    .mobile-actions .btn { width: auto; padding-inline: 8px; gap: 5px; }
    .mobile-actions span { display: inline; }
  }
  @media (max-width: 360px) {
    .top { padding-inline: 8px; }
    .actions { gap: 4px; }
    .actions .btn { padding-inline: 8px; gap: 5px; }
    .mobile-actions .btn { width: 30px; padding: 0; }
  }
</style>
