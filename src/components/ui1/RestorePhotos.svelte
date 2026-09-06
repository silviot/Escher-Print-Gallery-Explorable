<script module lang="ts">
  export type RestoreAttempt = {
    location: string;
    checked: number;
    restored: number;
    unreadable: number;
    status: 'complete' | 'stopped' | 'failed';
  };
</script>

<script lang="ts">
  import { requestPersistentStorage } from '../../lib/ui1/persistence';
  import { restorePhotos, type MissingPhoto, type RestoreProgress } from '../../lib/ui1/persistence/restore';

  let { missing, onRestored, attempts = $bindable<RestoreAttempt[]>([]) }: {
    missing: MissingPhoto[];
    onRestored: (ids: string[]) => void;
    attempts?: RestoreAttempt[];
  } = $props();
  let input = $state<HTMLInputElement>();
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let controller: AbortController | null = null;
  const canChooseFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  type Directory = {
    kind: 'directory';
    name: string;
    values(): AsyncIterable<Directory | { kind: 'file'; getFile(): Promise<File> }>;
  };
  async function* photosIn(directory: Directory): AsyncGenerator<File> {
    for await (const handle of directory.values()) {
      if (controller?.signal.aborted) return;
      if (handle.kind === 'directory') yield* photosIn(handle);
      else {
        const file = await handle.getFile();
        if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) yield file;
      }
    }
  }

  async function restore(files: Iterable<File> | AsyncIterable<File>, location = 'Selected photos') {
    if (busy) return;
    busy = true;
    error = '';
    message = `Searching ${location}…`;
    controller = new AbortController();
    const initialMissing = missing.length;
    const restored = new Set<string>();
    let checked = 0;
    let unreadable = 0;
    let status: RestoreAttempt['status'] = 'complete';
    void requestPersistentStorage();
    const progress = (result: RestoreProgress) => {
      checked = result.checked;
      unreadable = result.unreadable;
      const fresh = result.restoredIds.filter(id => !restored.has(id));
      for (const id of fresh) restored.add(id);
      if (fresh.length) onRestored(fresh);
      message = `${location}: checked ${checked} photos · restored ${restored.size} of ${initialMissing} tententoons`;
    };
    try {
      const result = await restorePhotos(files, [...missing], { onProgress: progress, signal: controller.signal });
      progress(result);
      const remaining = initialMissing - restored.size;
      if (controller.signal.aborted) status = 'stopped';
      if (status === 'stopped') message = `Stopped searching ${location}.`;
      else if (!checked) message = `No JPG, PNG or WebP photos found in ${location}.`;
      else if (!restored.size) message = `No matching photos found in ${location}.`;
      else message = `Restored ${restored.size} ${restored.size === 1 ? 'tententoon' : 'tententoons'} from ${location}.`;
      if (remaining) message += ` ${remaining} still missing. Try another location below; completed restores are kept.`;
      else message += ' All saved photos are available.';
      if (unreadable) message += ` ${unreadable} files could not be read.`;
    } catch {
      status = 'failed';
      message = `Search of ${location} could not finish. ${restored.size} ${restored.size === 1 ? 'tententoon restored' : 'tententoons restored'}.`;
      error = 'Try another folder, or choose photos individually. Any completed restores are kept.';
    } finally {
      attempts = [...attempts, { location, checked, restored: restored.size, unreadable, status }];
      busy = false;
      controller = null;
      if (input) input.value = '';
    }
  }

  async function chooseFolder() {
    error = '';
    try {
      const picker = (window as unknown as { showDirectoryPicker: (opts: { mode: 'read' }) => Promise<Directory> }).showDirectoryPicker;
      const directory = await picker.call(window, { mode: 'read' });
      await restore(photosIn(directory), directory.name);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        error = 'Could not open that folder. Use “Choose photos” to select photos from an album instead.';
      }
    }
  }

  $effect(() => () => controller?.abort());
</script>

{#if missing.length || message || error}
  <section class="restore-box" aria-label="Restore missing photos">
    {#if missing.length}
      <p><strong>{missing.length} {missing.length === 1 ? 'tententoon is missing its photo' : 'tententoons are missing their photos'}.</strong></p>
      <p>Find the original photos to restore your saved framing and settings. You can search several locations, one after another.</p>
    {/if}
    {#if message}<p class="status" role="status" aria-live="polite">{message}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if missing.length && !busy}
      <p class="guide-title">{attempts.length ? 'Try another location:' : 'Start here, then try the next place if photos are still missing:'}</p>
      <ol class="locations">
        <li><strong>Camera</strong> — often inside DCIM</li>
        <li><strong>Pictures</strong> or <strong>Screenshots</strong></li>
        <li><strong>WhatsApp Images</strong> or another messaging app’s photo folder</li>
        <li><strong>Downloads</strong></li>
      </ol>
      {#if canChooseFolder}
        <p>Choose a folder in the file picker and allow access. Its subfolders are searched too.</p>
      {:else}
        <p>Choose photos from one album at a time. You can select several photos together.</p>
      {/if}
      <div class="actions">
        {#if canChooseFolder}
          <button class="primary" onclick={chooseFolder}>{attempts.length ? 'Search another folder' : 'Search a folder'}</button>
        {/if}
        <button class:primary={!canChooseFolder} onclick={() => input?.click()}>Choose photos</button>
      </div>
      <p class="hint">Use the original photos; edited or recompressed copies may not match. Everything stays in this browser.</p>
    {/if}
    {#if busy}<button onclick={() => controller?.abort()}>Stop searching</button>{/if}
    <input bind:this={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Select original photos to restore" onchange={() => { if (input?.files?.length) void restore(Array.from(input.files)); }} />
    {#if attempts.length}
      <details class="attempts">
        <summary>Places tried this visit ({attempts.length})</summary>
        <ul>
          {#each attempts as attempt}
            <li>
              <strong>{attempt.location}</strong> — {attempt.checked} checked, {attempt.restored} restored
              {#if attempt.status === 'stopped'} · stopped early{:else if attempt.status === 'failed'} · search incomplete{/if}
              {#if attempt.unreadable} · {attempt.unreadable} unreadable{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>
{/if}

<style>
  .restore-box { margin-bottom: 16px; padding: 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel-2); }
  p, .locations, .attempts { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: var(--ink-2); }
  p:last-child { margin-bottom: 0; }
  strong { color: var(--ink); }
  .guide-title { margin-top: 12px; }
  .locations { padding-left: 20px; }
  .locations li { margin-bottom: 4px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { padding: 8px 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .status, .error, .hint, .attempts { margin-top: 12px; }
  .status { color: var(--ink); }
  .error { color: var(--danger, #c0392b); }
  .attempts { margin-bottom: 0; }
  .attempts summary { cursor: pointer; }
  .attempts ul { padding-left: 20px; margin: 8px 0 0; }
  .attempts li { overflow-wrap: anywhere; margin-bottom: 4px; }
</style>
