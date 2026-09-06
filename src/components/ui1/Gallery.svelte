<script lang="ts">
  /**
   * Modal sheet listing every tententoon on this device. Click a tile to
   * load it; modal closes once the load completes. List is read once on
   * open — no live refresh while open. V3 adds rename/delete/new; V5
   * swaps the placeholder thumbs for real captures.
   */
  import Icon from './Icon.svelte';
  import GalleryTile from './GalleryTile.svelte';
  import RestorePhotos, { type RestoreAttempt } from './RestorePhotos.svelte';
  import { findMissingPhotos, type MissingPhoto } from '../../lib/ui1/persistence/restore';
  import { scheduleThumb } from '../../lib/ui1/thumb.svelte';
  import RenameModal from './RenameModal.svelte';
  import DeleteConfirm from './DeleteConfirm.svelte';
  import { list, type IndexEntry } from '../../lib/ui1/persistence';
  import {
    currentTententoon,
    load,
    createEmpty,
    renameTententoon,
    deleteTententoon
  } from '../../lib/ui1/tententoon.svelte';

  type Props = { open: boolean; onClose: () => void };
  let { open, onClose }: Props = $props();

  let entries = $state<IndexEntry[]>([]);
  let missingPhotos = $state<MissingPhoto[]>([]);
  let restoreAttempts = $state<RestoreAttempt[]>([]);
  let scanVersion = 0;
  let pendingId = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  let renameTarget = $state<IndexEntry | null>(null);
  let deleteTarget = $state<IndexEntry | null>(null);

  // Re-read the index every time the modal opens — and whenever we
  // mutate (rename/delete/new) — so the grid reflects the latest state
  // without a page reload. Reading localStorage is sync + cheap.
  $effect(() => {
    if (open) refresh();
    else scanVersion++;
  });

  function refresh() {
    const all = list();
    entries = all;
    const version = ++scanVersion;
    void findMissingPhotos(all).then(missing => {
      if (version === scanVersion) missingPhotos = missing;
    }).catch(() => {
      if (version === scanVersion) loadError = 'Could not check saved photos. Close and reopen the gallery to try again.';
    });
  }

  function onRestored(ids: string[]) {
    scanVersion++;
    const restored = new Set(ids);
    missingPhotos = missingPhotos.filter(photo => !restored.has(photo.id));
    for (const id of ids) scheduleThumb(id);
    loadError = null;
  }

  async function onPick(id: string) {
    if (pendingId) return;
    pendingId = id;
    loadError = null;
    try {
      const ok = await load(id);
      if (ok) onClose();
      else {
        loadError = 'Picture data is missing or unreadable for that saved tententoon.';
        refresh();
      }
    } catch {
      loadError = 'Could not read this saved photo from your browser. Please try again.';
    } finally {
      pendingId = null;
    }
  }

  function onNew() {
    createEmpty();
    onClose();
  }

  function onRename(entry: IndexEntry) {
    renameTarget = entry;
  }

  function onDelete(entry: IndexEntry) {
    deleteTarget = entry;
  }

  function saveRename(name: string) {
    if (!renameTarget) return;
    renameTententoon(renameTarget.id, name);
    renameTarget = null;
    refresh();
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteTententoon(deleteTarget.id);
    deleteTarget = null;
    refresh();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $effect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onclick={onClose}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="gallery-title">
    <header class="head">
      <div class="title-wrap">
        <h2 id="gallery-title">Gallery</h2>
        <p class="sub">
          {entries.length === 0
            ? 'No tententoons yet.'
            : `${entries.length} on this device`}
        </p>
      </div>
      <button class="new" onclick={onNew} title="New tententoon">
        <Icon name="plus" size={14} /><span>New</span>
      </button>
      <button class="x" onclick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
    </header>

    <div class="body">
      <RestorePhotos missing={missingPhotos} {onRestored} bind:attempts={restoreAttempts} />
      {#if loadError}
        <p class="error" role="status">{loadError}</p>
      {/if}
      {#if entries.length === 0}
        <div class="empty">
          <Icon name="image" size={32} />
          <p>Choose a photo to make your first tententoon.</p>
        </div>
      {:else}
        <div class="grid">
          {#each entries as entry (entry.id)}
            <GalleryTile
              {entry}
              isCurrent={entry.id === currentTententoon.id}
              missing={missingPhotos.some(photo => photo.id === entry.id)}
              onPick={onPick}
              onRename={onRename}
              onDelete={onDelete}
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <RenameModal
    open={renameTarget !== null}
    initial={renameTarget?.name ?? ''}
    onClose={() => (renameTarget = null)}
    onSave={saveRename}
  />
  <DeleteConfirm
    open={deleteTarget !== null}
    name={deleteTarget?.name ?? ''}
    onClose={() => (deleteTarget = null)}
    onConfirm={confirmDelete}
  />
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(20, 14, 10, 0.42);
    backdrop-filter: blur(2px);
    z-index: 40;
    animation: fade 140ms ease-out;
  }
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(820px, calc(100vw - 32px));
    max-height: calc(100dvh - 64px);
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: rise 180ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes rise {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
    to   { opacity: 1; transform: translate(-50%, -50%); }
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 18px 18px 12px;
    border-bottom: 1px solid var(--border);
  }
  .title-wrap { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  .sub { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
  .new {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    box-sizing: border-box;
    border-radius: 7px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .new:hover { filter: brightness(1.05); border-color: var(--accent); color: #fff; }
  .new span { font-weight: 500; }

  .x {
    width: 28px;
    height: 28px;
    padding: 0;
    box-sizing: border-box;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .x:hover { background: var(--panel-2); color: var(--ink); border-color: transparent; }

  .body {
    padding: 14px 18px 18px;
    overflow-y: auto;
  }

  .error {
    margin: 0 0 12px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, #c84a4a 45%, var(--border));
    border-radius: 7px;
    background: color-mix(in srgb, #c84a4a 10%, var(--panel));
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1.35;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 36px 12px 28px;
    color: var(--muted);
  }
  .empty p { margin: 0; font-size: 13px; }

  @media (max-width: 720px) {
    .sheet {
      width: calc(100dvw - 16px);
      max-height: calc(100dvh - 32px);
      border-radius: 12px;
    }
    .head { padding: 14px 14px 10px; }
    .body { padding: 12px 14px 16px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  }
</style>
