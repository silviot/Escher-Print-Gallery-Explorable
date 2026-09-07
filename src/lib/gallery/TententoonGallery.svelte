<script lang="ts">
  import CinemaGallery from './CinemaGallery.svelte';
  import PassageGallery from './PassageGallery.svelte';
  import CabinetGallery from './CabinetGallery.svelte';
  import type { GalleryProps, GalleryVariant } from './types';
  let { items, variant = 'cinema', initialId, onselect }: GalleryProps & { variant?: GalleryVariant } = $props();
</script>

{#if items.length === 0}
  <p class="empty">The gallery is waiting for its first image.</p>
{:else if variant === 'passage'}
  <PassageGallery {items} {initialId} {onselect} />
{:else if variant === 'cabinet'}
  <CabinetGallery {items} {initialId} {onselect} />
{:else}
  <CinemaGallery {items} {initialId} {onselect} />
{/if}

<style>.empty { padding:4rem 2rem; text-align:center; font:16px/1.5 system-ui; }</style>
