<script lang="ts">
  import { imageState, loadImageFromFile } from '../lib/stores/image.svelte';

  let dragOver = $state(false);
  let input: HTMLInputElement;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      imageState.error = `Not an image: ${file.type || 'unknown type'}`;
      return;
    }
    await loadImageFromFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    onFiles(e.dataTransfer?.files ?? null);
  }
</script>

<div
  class="uploader"
  class:drag-over={dragOver}
  ondragover={(e) => {
    e.preventDefault();
    dragOver = true;
  }}
  ondragleave={() => (dragOver = false)}
  ondrop={onDrop}
  role="region"
  aria-label="Image uploader"
>
  <input
    bind:this={input}
    type="file"
    accept="image/*"
    hidden
    onchange={(e) => onFiles((e.currentTarget as HTMLInputElement).files)}
  />
  <button onclick={() => input.click()}>Choose image</button>
  <span class="muted">or drop one here</span>
  {#if imageState.error}
    <span class="error">· {imageState.error}</span>
  {/if}
</div>

<style>
  .uploader {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px dashed var(--border);
    transition: border-color 120ms var(--ease), background-color 120ms var(--ease);
  }
  .uploader.drag-over {
    border-color: var(--teal);
    background: rgba(88, 196, 221, 0.06);
  }
  .error {
    color: var(--warm);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }
</style>
