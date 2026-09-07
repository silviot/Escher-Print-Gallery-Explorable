<script lang="ts">
  /**
   * "Recent tententoons" dropdown. Reads the up-to-3 reactive entries
   * from history.svelte.ts; clicking a thumbnail re-decodes the stored
   * blob and swaps it in as the working image. Self-hides when the
   * history is empty so the TopBar doesn't carry a useless button on
   * the very first session.
   */
  import Icon from './Icon.svelte';
  import { ui, setImage } from '../../lib/ui1/state.svelte';
  import {
    historyState,
    loadFromHistory,
    removeFromHistory,
    type HistoryEntry
  } from '../../lib/ui1/history.svelte';
  import { markCreate } from '../../lib/ui1/tententoon.svelte';
  import { putBlob, requestPersistentStorage } from '../../lib/ui1/persistence';

  let open = $state(false);
  let { expandedLabel = false, onPick }: { expandedLabel?: boolean; onPick?: () => void } = $props();
  let loading = $state<string | null>(null);

  const entries = $derived(historyState.entries);

  function toggle() { open = !open; }
  function close() { open = false; }

  async function pick(entry: HistoryEntry) {
    if (loading) return;
    loading = entry.id;
    try {
      const r = await loadFromHistory(entry.id);
      if (r) {
        void requestPersistentStorage();
        let hash: string;
        try {
          hash = await putBlob(r.blob);
        } catch (error) {
          r.image.close();
          throw error;
        }
        setImage(r.image, r.name);
        ui.view = 'split';
        markCreate({ kind: 'blob', hash });
      }
      open = false;
      onPick?.();
    } catch {
      ui.exportToast = 'Could not open and save this photo in your browser. Please try again.';
    } finally {
      loading = null;
    }
  }

  async function remove(e: MouseEvent, entry: HistoryEntry) {
    // Stop the outer button's click so removing one doesn't load it.
    e.stopPropagation();
    await removeFromHistory(entry.id);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
  $effect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if entries.length > 0}
  <div class="wrap" class:expanded-label={expandedLabel}>
    <button
      class="btn ghost compactable"
      class:active={open}
      onclick={toggle}
      title="Recent pictures"
      aria-label="Recent pictures"
      aria-expanded={open}
    >
      <Icon name="history" size={14} /><span class="lbl">Recent</span>
    </button>
    {#if open}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="backdrop" onclick={close}></div>
      <div class="menu" role="menu">
        <div class="header">RECENT</div>
        {#each entries as e (e.id)}
          <div class="row" class:loading={loading !== null}>
            <button
              class="item"
              disabled={loading !== null}
              onclick={() => pick(e)}
              aria-label={`Load ${e.name || 'recent image'}`}
            >
              <span class="thumb">
                <img src={e.thumbDataUrl} alt="" />
              </span>
              <span class="text">
                <span class="t">{e.name || 'Untitled'}</span>
                <span class="s">{e.width}×{e.height}</span>
              </span>
            </button>
            <button
              class="del"
              onclick={(ev) => remove(ev, e)}
              title="Remove from history"
              aria-label="Remove from history"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap { position: relative; display: inline-flex; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
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
  .btn.ghost { background: transparent; border-color: transparent; }
  .btn.ghost:hover { background: var(--panel-2); }
  .btn.active { background: var(--panel-2); }
  .expanded-label { display: flex; width: 100%; }
  .expanded-label .btn { width: 100%; min-height: 40px; padding: 8px 10px; gap: 10px; font-size: 13px; }
  .expanded-label .lbl { display: inline; }
  @media (max-width: 720px) {
    .wrap:not(.expanded-label) .compactable .lbl { display: none; }
    .compactable { padding: 7px; min-height: 40px; gap: 0; }
  }

  /* Click-outside closer. */
  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 15;
  }
  .menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    min-width: 260px;
    padding: 6px;
    z-index: 20;
  }
  /* Phones: bottom sheet (same pattern as ExportMenu / ShareMenu). */
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
  .row {
    display: flex;
    align-items: stretch;
    border-radius: 6px;
  }
  .row:hover { background: var(--panel-2); }
  .row.loading { opacity: 0.6; }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    border: 0;
    flex: 1;
    min-width: 0;
    text-align: left;
    color: var(--ink);
    font: inherit;
  }
  .item:disabled { cursor: progress; }
  .thumb {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--panel-2);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .text { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; }
  .t {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
  .del {
    width: 28px;
    margin: 6px 4px 6px 0;
    border-radius: 5px;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    align-self: stretch;
  }
  .del:hover { background: var(--panel); color: var(--ink); }
</style>
