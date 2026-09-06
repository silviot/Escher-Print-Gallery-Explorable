<script lang="ts">
  /**
   * One gallery tile, with a saved preview and creation date.
   *
   * Hovering the tile reveals two action buttons (rename, delete) in
   * the top-right corner. Clicking them stops propagation so the tile's
   * own click handler (= open this tententoon) doesn't also fire.
   */
  import Icon from './Icon.svelte';
  import type { IndexEntry } from '../../lib/ui1/persistence';
  import { thumbCache, loadThumbInto, scheduleThumb } from '../../lib/ui1/thumb.svelte';

  type Props = {
    entry: IndexEntry;
    isCurrent: boolean;
    missing?: boolean;
    onPick: (id: string) => void;
    onRename: (entry: IndexEntry) => void;
    onDelete: (entry: IndexEntry) => void;
  };
  let { entry, isCurrent, missing = false, onPick, onRename, onDelete }: Props = $props();

  function seedHue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function relTime(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 60_000) return 'now';
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  const hue = $derived(seedHue(entry.id));
  const stamp = $derived(relTime(entry.createdAt));
  const thumbUrl = $derived(thumbCache[entry.id] ?? null);

  // Pull the thumb out of IDB on first mount. Subsequent autosave
  // captures publish straight to thumbCache.
  $effect(() => {
    void loadThumbInto(entry.id);
  });
</script>

<!--
  Tile is a div+role=button rather than a real <button> because the
  rename/delete affordances inside it are themselves buttons, and a
  button-in-button is invalid HTML. We keep keyboard activation
  (Enter / Space) so the tile stays accessible.
-->
<div
  class="tile"
  class:current={isCurrent}
  role="button"
  tabindex="0"
  onclick={() => onPick(entry.id)}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(entry.id);
    }
  }}
>
  {#if thumbUrl}
    <img class="thumb thumb-img" src={thumbUrl} alt="" onerror={() => scheduleThumb(entry.id)} />
  {:else}
    <div
      class="thumb"
      style:--h={hue}
      aria-hidden="true"
    ></div>
  {/if}
  <div class="meta">
    <span class="name" title={entry.name}>{entry.name}</span>
    <span class="when mono">{stamp}</span>
    {#if missing}<span class="missing-photo">Photo missing</span>{/if}
  </div>
  {#if isCurrent}
    <span class="badge">Current</span>
  {/if}
  <div class="actions">
    <button
      class="action"
      title="Rename"
      aria-label="Rename"
      onclick={(e) => { e.stopPropagation(); onRename(entry); }}
    >
      <Icon name="pencil" size={13} />
    </button>
    <button
      class="action danger"
      title="Delete"
      aria-label="Delete"
      onclick={(e) => { e.stopPropagation(); onDelete(entry); }}
    >
      <Icon name="trash" size={13} />
    </button>
  </div>
</div>

<style>
  .missing-photo { font-size: 11px; color: var(--danger, #c0392b); }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    text-align: left;
    padding: 0;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 120ms, transform 120ms;
  }
  .tile:hover { border-color: var(--accent); }
  .tile:active { transform: scale(0.99); }
  .tile.current {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .thumb {
    aspect-ratio: 4 / 3;
    background:
      linear-gradient(
        135deg,
        hsl(var(--h) 55% 70%) 0%,
        hsl(calc(var(--h) + 30) 60% 45%) 100%
      );
  }
  .thumb-img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: #000;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px 10px;
    min-width: 0;
  }
  .name {
    font-size: 12.5px;
    line-height: 1.3;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when {
    font-size: 11px;
    color: var(--muted);
  }

  .badge {
    position: absolute;
    top: 6px;
    left: 6px;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 999px;
    letter-spacing: 0.04em;
  }

  .actions {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 120ms;
  }
  .tile:hover .actions,
  .tile:focus-within .actions { opacity: 1; }

  .action {
    width: 26px;
    height: 26px;
    padding: 0;
    box-sizing: border-box;
    border-radius: 6px;
    border: none;
    background: rgba(255, 255, 255, 0.92);
    color: #2a241c;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    transition: background-color 120ms, color 120ms;
  }
  .action:hover { background: #fff; color: #000; border-color: transparent; }
  .action.danger:hover { background: #c84a4a; color: #fff; }
</style>
