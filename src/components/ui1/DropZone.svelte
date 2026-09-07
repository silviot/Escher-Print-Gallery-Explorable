<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, doc, setImage, commitNewRect, snapShapeMorph } from '../../lib/ui1/state.svelte';
  import { loadFile, loadUrl } from '../../lib/ui1/file';
  import { addToHistory } from '../../lib/ui1/history.svelte';
  import { markSourceLoaded } from '../../lib/ui1/tententoon.svelte';
  import { putBlob, requestPersistentStorage } from '../../lib/ui1/persistence';
  import { publicAssetUrl } from '../../lib/asset-url';
  import demoImage from '../../lib/demo-image.json';
  import { makeTestPattern, patternNest, type PatternKind } from '../../lib/ui1/test-patterns';

  let dragOver = $state(false);
  let input: HTMLInputElement;
  let errorMsg = $state<string | null>(null);

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const r = await loadFile(file);
    if (r.ok) {
      void requestPersistentStorage();
      try {
        const hash = await putBlob(file);
        setImage(r.image, r.name);
        // Gallery "New" entries are filled in place.
        markSourceLoaded({ kind: 'blob', hash });
        void addToHistory(file, r.image, r.name);
        errorMsg = null;
      } catch {
        if (doc.image !== r.image) r.image.close();
        errorMsg = 'Could not save this photo in your browser. Free some device space and try again.';
      }
    } else {
      errorMsg = r.reason;
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    handle(e.dataTransfer?.files ?? null);
  }

  async function trySample() {
    const url = publicAssetUrl(demoImage.plainImage);
    const r = await loadUrl(url);
    if (r.ok) {
      setImage(r.image, demoImage.name);
      doc.shape = demoImage.shape === 'ellipse' ? 'ellipse' : 'rect';
      snapShapeMorph();
      commitNewRect({ ...demoImage.nest });
      markSourceLoaded({ kind: 'url', url });
    } else {
      errorMsg = r.reason;
    }
  }

  // Generated geometry patterns. A centred square nest puts the limit point
  // at the image centre, so the polar pattern maps to a clean grid in the
  // log panel — the clearest way to see what the transform does.
  async function tryPattern(kind: PatternKind) {
    const bmp = await makeTestPattern(kind);
    // Ephemeral test input — load it as the working image without touching
    // the gallery/persistence source tracking (patterns aren't files).
    setImage(bmp, kind === 'polar' ? 'Polar grid' : 'Cartesian grid');
    commitNewRect(patternNest());
    errorMsg = null;
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) {
          const files = new DataTransfer();
          files.items.add(f);
          handle(files.files);
          return;
        }
      }
    }
  }

  $effect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
</script>

<div
  class="drop"
  class:over={dragOver}
  ondragover={(e) => { e.preventDefault(); dragOver = true; }}
  ondragleave={() => (dragOver = false)}
  ondrop={onDrop}
  role="region"
  aria-label="Image drop zone"
>
  <span class="bigicon"><Icon name="uploadBig" size={28} stroke={1.8} /></span>
  <div class="h">Drop an image to start</div>
  <div class="s">or paste from clipboard · click to choose · JPG, PNG, WebP up to 20 MB</div>
  <div class="actions">
    <button class="btn primary" onclick={() => input.click()}>
      <Icon name="upload" size={14} />Choose photo
    </button>
    <button class="btn ghost" onclick={trySample}>Try with sample</button>
  </div>
  <div class="patterns">
    <span class="plabel mono">or a geometry test pattern:</span>
    <button class="btn chip" onclick={() => tryPattern('polar')}>Polar grid</button>
    <button class="btn chip" onclick={() => tryPattern('grid')}>Cartesian grid</button>
  </div>
  <span class="footnote mono">Your photos stay in this browser.</span>
  {#if errorMsg}
    <span class="error mono">· {errorMsg}</span>
  {/if}
  <input
    bind:this={input}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
    onchange={(e) => handle((e.currentTarget as HTMLInputElement).files)}
  />
</div>

<style>
  .drop {
    width: 100%;
    max-width: 640px;
    aspect-ratio: 16 / 10;
    border: 2px dashed var(--border-strong);
    border-radius: 14px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--ink-2);
    padding: 24px;
    margin: 32px auto;
    transition: border-color 120ms, background-color 120ms;
  }
  .drop.over {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .bigicon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .h { font-size: 22px; font-weight: 600; color: var(--ink); text-align: center; }
  .s { font-size: 14px; color: var(--muted); text-align: center; max-width: 36ch; }
  .actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--ink);
    /* Without nowrap the button text would break inside a constrained
       flex parent (e.g. "Choose / file" two-line label). */
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn:hover { background: var(--panel-2); }
  .btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .btn.ghost { background: transparent; border-color: transparent; }
  .btn.chip { padding: 5px 10px; font-size: 12px; }
  .patterns {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .plabel { font-size: 12px; color: var(--muted); }
  .footnote { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: var(--font-mono); text-align: center; }
  .error { font-size: 11px; color: var(--accent); margin-top: 4px; font-family: var(--font-mono); }
  .mono { font-family: var(--font-mono); }

  /* Narrow viewports: the 16:10 aspect makes a 320-wide card 200 tall,
     too short for icon + heading + body + actions + footnote. Drop the
     aspect lock and let content size the card; trim the heading and
     section paddings so the whole zone fits in a phone's middle band. */
  @media (max-width: 720px) {
    .drop {
      aspect-ratio: auto;
      padding: 20px 16px;
      gap: 12px;
      margin: 16px auto;
    }
    .h { font-size: 18px; }
    .s { font-size: 13px; max-width: 28ch; }
    .bigicon { width: 44px; height: 44px; border-radius: 11px; }
  }
</style>
