<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { label, description = label, above = false, start = false, accent = false, children }: {
    label: string;
    description?: string;
    above?: boolean;
    start?: boolean;
    accent?: boolean;
    children: Snippet<[() => void]>;
  } = $props();

  let menu: HTMLDetailsElement;
  function close() { menu.open = false; }
  function dismissOutside(e: Event) {
    if (menu.open && e.target instanceof Node && !menu.contains(e.target)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (menu.open && e.key === 'Escape') {
      close();
      menu.querySelector('summary')?.focus();
    }
  }
</script>

<svelte:window onpointerdown={dismissOutside} onfocusin={dismissOutside} onkeydown={onKey} onresize={() => { if (window.innerWidth > 720) close(); }} />

<details class="mobile-menu" class:above class:start class:accent bind:this={menu}>
  <summary>{label}<Icon name="caret" size={12} /></summary>
  <div class="panel" role="group" aria-label={description}>
    {@render children(close)}
  </div>
</details>

<style>
  .mobile-menu { display: none; position: relative; flex-shrink: 0; }
  summary { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 7px; color: var(--ink-2); font-size: 12px; font-weight: 500; cursor: pointer; list-style: none; white-space: nowrap; }
  summary::-webkit-details-marker { display: none; }
  summary:hover, details[open] summary { background: var(--panel-2); color: var(--ink); }
  .accent summary { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .panel { position: absolute; z-index: 40; top: calc(100% + 6px); right: 0; width: min(280px, calc(100vw - 16px)); padding: 8px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--panel); box-shadow: var(--shadow); }
  .above .panel { top: auto; bottom: calc(100% + 6px); }
  .start .panel { left: 0; right: auto; }
  .panel :global(.menu-action) { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 6px; color: var(--ink); font: inherit; font-size: 13px; text-align: left; }
  .panel :global(.menu-action:hover:not(:disabled)) { background: var(--panel-2); }
  .panel :global(.menu-action:disabled) { opacity: 0.4; cursor: not-allowed; }
  @media (max-width: 720px) { .mobile-menu { display: block; } }
</style>
