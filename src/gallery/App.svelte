<script lang="ts">
  import TententoonGallery from '../lib/gallery/TententoonGallery.svelte';
  import type { GalleryItem, GalleryVariant } from '../lib/gallery/types';
  import { galleryItems } from './collection';
  let { variant = 'cinema' }: { variant?: GalleryVariant } = $props();
  let selected = $state(new URLSearchParams(location.search).get('image') ?? galleryItems[0].id);
  const variations = [
    { id: 'cinema', name: 'Cinema', href: './index.html', number: '01' },
    { id: 'passage', name: 'Passage', href: './passage.html', number: '02' },
    { id: 'cabinet', name: 'Cabinet', href: './cabinet.html', number: '03' }
  ];
  function select(item: GalleryItem) {
    selected = item.id;
    const url = new URL(location.href); url.searchParams.set('image', item.id);
    history.replaceState({}, '', url);
  }
</script>

<svelte:head><title>tententoon gallery · {variant[0].toUpperCase() + variant.slice(1)}</title><meta name="description" content="A collection of impossible images. Explore the transition from original image to Droste to an endless tententoon spiral, in three interactive galleries." /></svelte:head>
<div class:dark={variant === 'cinema'} class="gallery-page">
  <a class="skip" href="#collection">Skip to gallery</a>
  <header>
    <a class="brand" href="./index.html" aria-label="tententoon gallery home">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M2 2h24v24H2V2Zm6 5h14v14H8V7Zm4 4h8v8h-8v-8Zm3 3h4v4h-4v-4Z" stroke="currentColor" stroke-width="1.2" /></svg>
      <span>tententoon <em>gallery</em></span>
    </a>
    <nav aria-label="Gallery variations">
      {#each variations as v}<a href={`${v.href}?image=${encodeURIComponent(selected)}`} aria-current={variant === v.id ? 'page' : undefined}><span>{v.number}</span>{v.name}</a>{/each}
    </nav>
    <a class="tool-link" href="../tool.html">Make your own <span aria-hidden="true">↗</span></a>
  </header>
  <main id="collection"><TententoonGallery items={galleryItems} {variant} initialId={selected} onselect={select} /></main>
  <footer><span>tententoon · a picture with no last picture</span><span>{galleryItems.length} generated studies · three ways to look</span></footer>
</div>

<style>
  :global(*) { box-sizing:border-box; }
  :global(body) { margin:0; background:#f5f3ec; font-family:system-ui,sans-serif; }
  :global(button), :global(input) { font:inherit; }
  :global(button), :global(a), :global(input) { -webkit-tap-highlight-color:transparent; }
  :global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible) { outline:2px solid #687849; outline-offset:4px; }
  .gallery-page { --gallery-ink:#25271f; --gallery-paper:#f5f3ec; color:var(--gallery-ink); background:var(--gallery-paper); min-height:100vh; }
  .gallery-page.dark { background:#171b19; color:#eceee4; }
  header { height:78px; padding:0 clamp(20px,4vw,72px); display:flex; align-items:center; justify-content:space-between; gap:20px; border-bottom:1px solid #d9d9ce; }
  .dark header { border-color:#384034; }
  a { color:inherit; text-decoration:none; }
  .brand { display:flex; align-items:center; gap:12px; white-space:nowrap; }
  .brand > span { font:500 20px Georgia,serif; letter-spacing:-.04em; }
  .brand em { font-weight:400; opacity:.62; }
  nav { display:flex; gap:7px; }
  nav a { display:flex; gap:9px; align-items:center; padding:10px 13px; border:1px solid transparent; font-size:11px; opacity:.58; }
  nav a span { font-size:9px; opacity:.65; }
  nav a[aria-current=page] { border-color:#babfad; opacity:1; border-radius:30px; }
  .dark nav a[aria-current=page] { border-color:#626e54; }
  nav a:hover { opacity:1; }
  .tool-link { font-size:11px; display:flex; gap:14px; }
  .tool-link span { font-size:16px; }
  footer { display:flex; justify-content:space-between; padding:24px clamp(20px,4vw,72px); gap:12px; font-size:10px; color:#797e70; border-top:1px solid #d9d9ce; }
  .dark footer { color:#929d87; border-color:#384034; }
  .skip { position:fixed; z-index:100; top:8px; left:8px; padding:12px; background:#e2eccf; color:#1d2716; transform:translateY(-160%); }
  .skip:focus { transform:none; }
  @media(max-width:700px) { header { height:auto; min-height:98px; padding:16px 18px 12px; flex-wrap:wrap; gap:12px; } .brand > span { font-size:19px; } .brand svg { width:22px; height:22px; } nav { order:3; width:100%; justify-content:center; } nav a { padding:7px 15px; } .tool-link { font-size:10px; gap:7px; } footer { flex-direction:column; padding:22px 18px; } }
</style>
