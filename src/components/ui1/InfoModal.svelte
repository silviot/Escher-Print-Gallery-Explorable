<script lang="ts">
  import Icon from './Icon.svelte';

  type Props = { open: boolean; onClose: () => void };
  let { open, onClose }: Props = $props();

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

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="info-title">
    <header class="head">
      <div class="title-wrap">
        <h2 id="info-title">About <span class="name">tententoon</span></h2>
        <p class="sub human-written">A toy for re-creating the Droste effect from Escher's Print&nbsp;Gallery.</p>
      </div>
      <button class="x" onclick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
    </header>

    <!-- Hand-written copy. Marked .human-written — do not rewrite or regenerate. -->
    <div class="body human-written">
      <p>
        Inspired by M.&nbsp;C.&nbsp;Escher's lithograph
        <em>Prentententoonstelling</em> (1956) &mdash; Dutch for
        <em>print exhibition</em>. The name <strong>tententoon</strong> is a
        playful contraction of that title.
      </p>

      <p>
        Escher left a famous white blot at the centre of the print: the spiral
        was so tight that he couldn't draw it any further. In 2003, Hendrik
        Lenstra and Bart de&nbsp;Smit worked out the underlying math &mdash;
        a conformal map built from <strong>complex&nbsp;exponentials and
        logarithms</strong> &mdash; and completed the picture by computer.
      </p>

      <p>
        In 2026, <strong>Grant Sanderson</strong> (of <em>3Blue1Brown</em>)
        published a beautifully animated video walking through the paper.
        Highly recommended &mdash; it is the clearest tour of the math
        behind this toy.
      </p>

      <p>
        This editor is a small interactive take on that idea: pick a
        rectangle inside any image and watch it spiral into itself forever.
        <span class="aside">(Complex numbers are fun. So are logarithms.)</span>
      </p>

      <h3>Read &amp; watch</h3>
      <ul class="links">
        <li>
          <a href="https://en.wikipedia.org/wiki/Print_Gallery_(M._C._Escher)" target="_blank" rel="noopener noreferrer">
            <span class="lt">Wikipedia &mdash; <em>Print Gallery</em> (M.&nbsp;C.&nbsp;Escher)</span>
            <Icon name="external" size={12} />
          </a>
        </li>
        <li>
          <a href="https://www.ams.org/notices/200304/fea-escher.pdf" target="_blank" rel="noopener noreferrer">
            <span class="lt">Lenstra &amp; de&nbsp;Smit &mdash; <em>The Mathematical Structure of Escher's Print Gallery</em> (AMS&nbsp;Notices, 2003)</span>
            <Icon name="external" size={12} />
          </a>
        </li>
        <li>
          <a href="https://www.youtube.com/watch?v=ldxFjLJ3rVY" target="_blank" rel="noopener noreferrer">
            <span class="lt">3Blue1Brown &mdash; animated walkthrough of the paper (2026)</span>
            <Icon name="external" size={12} />
          </a>
        </li>
        <li>
          <a href="https://github.com/codemyriad/tententoon" target="_blank" rel="noopener noreferrer">
            <span class="lt">Source code &amp; license &mdash; AGPLv3 or later</span>
            <Icon name="external" size={12} />
          </a>
        </li>
      </ul>
    </div>
  </div>
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
    width: min(560px, calc(100vw - 32px));
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
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  h2 .name { color: var(--accent); }
  .sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .x {
    width: 28px;
    height: 28px;
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
  .x:hover { background: var(--panel-2); color: var(--ink); }

  .body {
    padding: 14px 18px 18px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--ink-2);
    overflow-y: auto;
  }
  .body p { margin: 0 0 10px; }
  .body p:last-of-type { margin-bottom: 14px; }
  .body strong { color: var(--ink); font-weight: 600; }
  .body em { font-style: italic; }
  .aside { color: var(--muted); }

  h3 {
    margin: 16px 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .links a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--ink);
    text-decoration: none;
    font-size: 13px;
    transition: border-color 120ms, background-color 120ms, color 120ms;
  }
  .links a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .links .lt { flex: 1; min-width: 0; }
  .links em { font-style: italic; color: inherit; }

  @media (max-width: 720px) {
    .sheet {
      width: calc(100vw - 16px);
      width: calc(100dvw - 16px);
      max-height: calc(100dvh - 32px);
      border-radius: 12px;
    }
    .head { padding: 14px 14px 10px; }
    .body { padding: 12px 14px 16px; font-size: 13px; }
    h2 { font-size: 16px; }
  }
</style>
