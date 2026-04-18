<script lang="ts">
  import Uploader from './components/Uploader.svelte';
  import SourcePanel from './components/SourcePanel.svelte';
  import LogPanel from './components/LogPanel.svelte';
  import RotatedLogPanel from './components/RotatedLogPanel.svelte';
  import EscherPanel from './components/EscherPanel.svelte';
  import ZoomPreview from './components/ZoomPreview.svelte';
  import { imageState, loadImageFromUrl, restoreLastSession } from './lib/stores/image.svelte';
  import { identityOf, readRect } from './lib/persistence';

  const EXAMPLE_URL = '/Droste_1260359-nevit.jpg';
  // Template-matched inner rectangle for the Wikipedia example (S ≈ 1.88).
  const EXAMPLE_PRESET = { x: 300, y: 297, w: 680, h: 510 };
  const LOCAL_URL = '/droste-image.jpg';

  let usingExample = $state(false);

  $effect(() => {
    if (imageState.source || imageState.loading) return;
    (async () => {
      if (await restoreLastSession()) {
        usingExample = imageState.source?.url === EXAMPLE_URL;
        return;
      }
      // Prefer a local (gitignored) image if present; otherwise the committed example.
      const head = await fetch(LOCAL_URL, { method: 'HEAD' }).catch(() => null);
      if (head && head.ok) {
        usingExample = false;
        const saved = readRect(identityOf(LOCAL_URL)) ?? undefined;
        await loadImageFromUrl(LOCAL_URL, saved);
      } else {
        usingExample = true;
        const saved = readRect(identityOf(EXAMPLE_URL)) ?? EXAMPLE_PRESET;
        await loadImageFromUrl(EXAMPLE_URL, saved);
      }
    })();
  });
</script>

<main>
  <header class="page-head">
    <h1>Droste Explorable</h1>
    <p class="muted sub">
      Place a self-similar nest inside an image. Watch the limit point emerge.
    </p>
  </header>

  <div class="row"><Uploader /></div>

  <div class="row">
    <SourcePanel />
  </div>

  <div class="row">
    <LogPanel />
  </div>

  <div class="row">
    <RotatedLogPanel />
  </div>

  <div class="row">
    <EscherPanel />
  </div>

  <div class="row">
    <ZoomPreview />
  </div>

  {#if usingExample}
    <footer class="credit muted">
      Example image:
      <a
        href="https://commons.wikimedia.org/wiki/File:Droste_1260359-nevit.jpg"
        target="_blank"
        rel="noopener noreferrer">Droste_1260359-nevit.jpg</a
      >
      by Nevit Dilmen ·
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer"
        >CC BY-SA 3.0</a
      >
    </footer>
  {/if}
</main>

<style>
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .page-head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
  }
  .sub {
    font-size: 1rem;
    font-style: italic;
  }
  .row { width: 100%; }
  .credit {
    font-size: 0.8rem;
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
    margin-top: 1rem;
  }
  .credit a {
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--border);
  }
  .credit a:hover { color: var(--teal); }
</style>
