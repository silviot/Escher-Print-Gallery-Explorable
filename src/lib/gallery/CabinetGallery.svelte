<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ArtworkStage from './ArtworkStage.svelte';
  import type { GalleryItem } from './types';

  let { items, initialId, onselect }: {
    items: GalleryItem[];
    initialId?: string;
    onselect?: (item: GalleryItem) => void;
  } = $props();

  const categories: (string | null)[] = $derived([null, ...new Set(items.map(item => item.category))]);
  const phases = ['Source image', 'Droste', 'Tententoon'];
  let category = $state<string | null>(null);
  let activeId = $state<string | null>(null);
  let progress = $state(0);
  let playing = $state(false);
  let reducedMotion = $state(false);
  let dialog = $state<HTMLDialogElement>();
  let previousFocus: HTMLElement | null = null;
  const visibleItems = $derived(category === null ? items : items.filter(item => item.category === category));
  const activeItem = $derived(items.find(item => item.id === activeId));
  const activeIndex = $derived(visibleItems.findIndex(item => item.id === activeId));
  const phase = $derived(progress < 0.5 ? 0 : progress < 1.5 ? 1 : 2);
  const phaseDescriptions = [
    'Start with an image. Somewhere inside it, there is room for the whole picture again.',
    'The picture folds into its own opening. Look closer: the next one is already waiting.',
    'The repetitions flow into a continuous spiral. The image becomes somewhere you can go.'
  ];

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    const updateMotion = () => { reducedMotion = query.matches; if (reducedMotion) playing = false; };
    query.addEventListener('change', updateMotion);
    let frame = 0;
    let previousTime = 0;
    const animate = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.1);
      previousTime = time;
      if (playing && progress < 2) progress = Math.min(2, progress + elapsed / 3.8);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); query.removeEventListener('change', updateMotion); };
  });

  async function openItem(item: GalleryItem) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeId = item.id;
    progress = 0;
    playing = false;
    onselect?.(item);
    await tick();
    if (dialog && !dialog.open) dialog.showModal();
  }

  function close() { dialog?.close(); }

  function afterClose() {
    playing = false;
    activeId = null;
    previousFocus?.focus({ preventScroll: true });
  }

  function step(direction: number) {
    if (!visibleItems.length) return;
    const next = visibleItems[(Math.max(0, activeIndex) + direction + visibleItems.length) % visibleItems.length];
    activeId = next.id;
    progress = 0;
    playing = false;
    onselect?.(next);
  }

  function setPhase(value: number) { playing = false; progress = value; }

  function togglePlayback() {
    if (reducedMotion) { setPhase(progress >= 2 ? 0 : Math.min(2, Math.floor(progress) + 1)); return; }
    playing = !playing;
  }

  function handleKeys(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  }

  function openCollection() {
    const item = visibleItems.find(item => item.id === initialId) ?? visibleItems[0];
    if (item) openItem(item);
  }
</script>

<section class="cabinet" aria-label="Tententoon image collection">
  <header class="cabinet-intro">
    <div class="intro-copy">
      <p class="eyebrow"><span class="collection-mark" aria-hidden="true">↳</span> A collection of possible impossibilities</p>
      <h1>A picture.<br />A way <em>inside.</em></h1>
    </div>
    <div class="intro-note">
      <span class="little-spiral" aria-hidden="true">◎</span>
      <p>Every image opens into another.<br />Pick one. Follow it a little further.</p>
      <button class="text-link" onclick={openCollection} disabled={!items.length}>Open the collection <span aria-hidden="true">↗</span></button>
    </div>
  </header>

  <div class="collection-toolbar">
    <div class="categories" aria-label="Filter collection">
      {#each categories as filter}
        <button class:chosen={category === filter} aria-pressed={category === filter} onclick={() => category = filter}>
          {filter ?? 'All images'}<span class="filter-count">{filter === null ? items.length : items.filter(item => item.category === filter).length}</span>
        </button>
      {/each}
    </div>
    <span class="collection-caption">An invitation to look twice</span>
  </div>

  <div class="contact-sheet">
    {#each visibleItems as item, index (item.id)}
      <button class="specimen" onclick={() => openItem(item)} aria-label={`Explore ${item.title}`}>
        <div class="specimen-image">
          <img src={item.thumbnail || item.src} alt={item.alt} loading={index < 3 ? 'eager' : 'lazy'} decoding="async" />
          <span class="image-invitation"><span>Step inside</span><span aria-hidden="true">↗</span></span>
          <span class="corner-mark" aria-hidden="true">↗</span>
        </div>
        <div class="specimen-label">
          <span class="specimen-number">{String(items.indexOf(item) + 1).padStart(2, '0')}</span>
          <span class="specimen-title">{item.title}</span>
          <span class="specimen-kind">{item.category}</span>
        </div>
      </button>
    {/each}
  </div>

  <footer class="collection-footnote">
    <span>Tententoon <span aria-hidden="true">↳</span> The cabinet</span>
    <span>A picture with no last picture.</span>
  </footer>
</section>

<dialog bind:this={dialog} class="inspection-dialog" onclose={afterClose} onkeydown={handleKeys} onclick={(event) => { if (event.target === dialog) close(); }} aria-labelledby="cabinet-artwork-title" aria-describedby="cabinet-artwork-description">
  {#if activeItem}
    <div class="inspection">
      <header class="inspection-topbar">
        <button class="back-button" onclick={close}><span aria-hidden="true">←</span> Collection</button>
        <span class="inspection-counter">{String(Math.max(0, activeIndex) + 1).padStart(2, '0')} <span>/</span> {String(visibleItems.length).padStart(2, '0')}</span>
        <button class="close-button" aria-label="Close image" onclick={close}>×</button>
      </header>
      <div class="inspection-body">
        <div class="stage-area">
          <div class="stage-frame">
            <ArtworkStage item={activeItem} {progress} {playing} />
          </div>
          <div class="stage-footnote"><span>{phases[phase]}</span><span>{playing ? 'In motion' : 'Take your time'}</span></div>
        </div>
        <aside class="inspection-details">
          <div class="artwork-heading">
            <p class="eyebrow">{activeItem.category} <span class="heading-dot" aria-hidden="true">·</span> Study {String(items.indexOf(activeItem) + 1).padStart(2, '0')}</p>
            <h2 id="cabinet-artwork-title">{activeItem.title}</h2>
            <p id="cabinet-artwork-description" class="artwork-description">{activeItem.description}</p>
          </div>

          <div class="journey-controls">
            <p class="journey-label">Follow the picture</p>
            <div class="phase-tabs" aria-label="Transformation stage">
              {#each phases as label, index}
                <button class:active={phase === index} aria-pressed={phase === index} onclick={() => setPhase(index)}><span>{index + 1}</span>{label}</button>
              {/each}
            </div>
            <div class="scrubber">
              <label class="visually-hidden" for="cabinet-progress">Image transformation</label>
              <input id="cabinet-progress" type="range" min="0" max="2" step="0.01" value={progress} oninput={(event) => setPhase(Number(event.currentTarget.value))} aria-valuetext={`${phases[phase]}, ${Math.round(progress * 50)} percent`} />
              <div class="scrubber-labels" aria-hidden="true"><span>Image</span><span>Infinity</span></div>
            </div>
            <p class="phase-description" aria-live="polite">{phaseDescriptions[phase]}</p>
            <button class="play-button" onclick={togglePlayback} aria-label={reducedMotion ? 'Advance transformation one stage' : playing ? 'Pause transformation' : 'Play transformation'}>
              <span class="play-symbol" aria-hidden="true">{reducedMotion ? '→' : playing ? 'Ⅱ' : '▶'}</span>
              <span>{reducedMotion ? 'Next stage' : playing ? 'Pause for a moment' : progress >= 2 ? 'Let it keep unfolding' : 'Play the transformation'}</span>
            </button>
            {#if reducedMotion}<p class="motion-note">Motion is reduced. Explore one stage at a time.</p>{/if}
          </div>

          <div class="inspection-navigation">
            <button onclick={() => step(-1)} aria-label="Previous image"><span aria-hidden="true">←</span> Previous</button>
            <button onclick={() => step(1)} aria-label="Next image">Next image <span aria-hidden="true">→</span></button>
          </div>
        </aside>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .cabinet { --ink: #292d25; --muted: #727468; --paper: #f4f2eb; --line: #d7d8cc; background: var(--paper); color: var(--ink); min-height: 100svh; padding: 74px max(30px, calc((100vw - 1450px) / 2)) 26px; font-family: 'Arial', sans-serif; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid #66713f; outline-offset: 5px; }
  button:disabled { opacity: .4; cursor: default; }
  .cabinet-intro { display: flex; justify-content: space-between; align-items: flex-end; gap: 60px; padding-bottom: 67px; }
  .eyebrow { margin: 0 0 27px; font-size: 10px; line-height: 1.5; letter-spacing: .13em; text-transform: uppercase; }
  .collection-mark { display: inline-flex; margin-right: 8px; font-size: 18px; line-height: 10px; vertical-align: middle; }
  h1 { font: 400 clamp(54px, 6.7vw, 96px)/.99 Georgia, 'Times New Roman', serif; letter-spacing: -.055em; margin: 0; }
  h1 em { font-weight: 400; color: #75815a; }
  .intro-note { width: 285px; padding-bottom: 6px; }
  .little-spiral { font: 300 54px/1 Georgia, serif; color: #75815a; display: block; margin-bottom: 22px; }
  .intro-note p { font-size: 14px; line-height: 1.7; margin: 0 0 24px; color: #6e7264; }
  .text-link { border: none; border-bottom: 1px solid #aaaF9b; background: transparent; color: #414b31; font-size: 12px; padding: 0 0 8px; }
  .text-link span { margin-left: 27px; }
  .collection-toolbar { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  .categories { display: flex; flex-wrap: wrap; gap: 0 24px; }
  .categories button { position: relative; border: 0; padding: 20px 0; background: transparent; color: var(--muted); font-size: 11px; white-space: nowrap; }
  .categories button.chosen { color: var(--ink); }
  .categories button.chosen::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #515e3d; }
  .filter-count { font-size: 8px; opacity: .6; margin-left: 5px; vertical-align: top; }
  .collection-caption { font: italic 12px Georgia, serif; color: var(--muted); }
  .contact-sheet { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px 24px; }
  .specimen { text-align: left; color: inherit; background: transparent; border: 0; padding: 0; min-width: 0; }
  .specimen-image { background: #e6e6dc; position: relative; aspect-ratio: 1; overflow: hidden; }
  .specimen-image img { width: 100%; height: 100%; display: block; object-fit: cover; transition: transform 700ms cubic-bezier(.2,.6,.2,1), filter 500ms ease; }
  .image-invitation { position: absolute; bottom: 18px; left: 18px; right: 18px; display: flex; justify-content: space-between; padding: 15px 16px; background: rgba(249,248,242,.93); backdrop-filter: blur(16px); color: #313b2b; font-size: 11px; opacity: 0; transform: translateY(7px); transition: opacity 250ms ease, transform 250ms ease; }
  .corner-mark { position: absolute; right: 14px; top: 14px; width: 28px; height: 28px; display: grid; place-items: center; background: rgba(249,248,242,.84); color: #313b2b; border-radius: 50%; font-size: 13px; transition: opacity 250ms ease; }
  .specimen:hover .specimen-image img, .specimen:focus-visible .specimen-image img { transform: scale(1.035); }
  .specimen:hover .image-invitation, .specimen:focus-visible .image-invitation { opacity: 1; transform: translateY(0); }
  .specimen:hover .corner-mark, .specimen:focus-visible .corner-mark { opacity: 0; }
  .specimen-label { display: grid; grid-template-columns: 21px 1fr auto; align-items: baseline; gap: 8px; padding-top: 13px; line-height: 1.5; }
  .specimen-number { font: 9px 'Courier New', monospace; color: #929586; }
  .specimen-title { font: 15px Georgia, serif; }
  .specimen-kind { font-size: 8px; color: #888a7e; }
  .collection-footnote { margin-top: 69px; padding-top: 23px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 20px; color: var(--muted); font-size: 10px; }
  .collection-footnote span span { margin: 0 5px; color: #52613e; }
  .inspection-dialog { padding: 0; border: 0; width: min(1350px, calc(100vw - 48px)); max-width: none; max-height: calc(100svh - 48px); background: #f4f2eb; color: #292d25; box-shadow: 0 20px 140px #0006; font-family: Arial, sans-serif; }
  .inspection-dialog::backdrop { background: rgba(31,34,27,.55); backdrop-filter: blur(9px); }
  .inspection { padding: 24px 28px 28px; }
  .inspection-topbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 22px; }
  .back-button, .close-button { background: transparent; border: 0; color: #515849; }
  .back-button { display: flex; align-items: center; gap: 9px; padding: 7px 0; font-size: 11px; }
  .close-button { font-size: 25px; line-height: 1; width: 32px; height: 32px; }
  .inspection-counter { font: 10px 'Courier New', monospace; color: #73796a; }
  .inspection-counter span { margin: 0 10px; color: #b4b8a9; }
  .inspection-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 42px; }
  .stage-area { min-width: 0; align-self: start; }
  .stage-frame { width: min(100%, calc(100svh - 183px)); aspect-ratio: 1; margin: 0 auto; background: #e5e4da; overflow: hidden; }
  .stage-footnote { display: flex; justify-content: space-between; max-width: calc(100svh - 183px); margin: 12px auto 0; color: #818777; font-size: 9px; }
  .inspection-details { display: flex; flex-direction: column; padding-top: 13px; }
  .artwork-heading .eyebrow { margin-bottom: 19px; font-size: 8px; color: #7b826f; }
  .heading-dot { padding: 0 5px; }
  h2 { font: 400 35px/1.1 Georgia, 'Times New Roman', serif; letter-spacing: -.035em; margin: 0 0 18px; }
  .artwork-description { font: 12px/1.75 Arial, sans-serif; color: #797e6f; margin: 0 0 34px; }
  .journey-label { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; margin: 0 0 16px; color: #565f4a; }
  .phase-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #d7d8cc; }
  .phase-tabs button { display: flex; flex-direction: column; gap: 9px; text-align: left; padding: 13px 0; border: 0; border-top: 2px solid transparent; margin-top: -1px; background: transparent; color: #8c9182; font-size: 10px; }
  .phase-tabs button span { font: 9px 'Courier New', monospace; }
  .phase-tabs button.active { border-top-color: #52613e; color: #344129; }
  .scrubber { margin-top: 9px; }
  .scrubber input { width: 100%; margin: 0; height: 22px; accent-color: #69764d; cursor: ew-resize; }
  .scrubber-labels { display: flex; justify-content: space-between; font-size: 8px; color: #898f7d; }
  .phase-description { font: italic 14px/1.6 Georgia, serif; color: #7d826f; min-height: 68px; margin: 21px 0; }
  .play-button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 15px 14px; background: #4f5c3c; color: #f9f8f0; border: 1px solid #4f5c3c; text-align: left; font-size: 10px; transition: background 180ms ease; }
  .play-button:hover { background: #3a492c; }
  .play-symbol { font-size: 12px; min-width: 15px; text-align: center; }
  .motion-note { font-size: 9px; line-height: 1.5; color: #7d826f; }
  .inspection-navigation { margin-top: auto; padding-top: 25px; display: flex; justify-content: space-between; gap: 12px; }
  .inspection-navigation button { background: transparent; color: #56634a; border: 0; font-size: 10px; padding: 10px 0; }
  .inspection-navigation span { margin: 0 4px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (min-width: 1700px) { .cabinet { padding-left: calc((100vw - 1450px) / 2); padding-right: calc((100vw - 1450px) / 2); } }
  @media (max-width: 1100px) { .specimen-label { grid-template-columns: 21px 1fr; } .specimen-kind { display: none; } .inspection-body { grid-template-columns: minmax(0, 1fr) 260px; gap: 25px; } h2 { font-size: 31px; } .inspection { padding: 18px 22px 22px; } }
  @media (max-width: 760px) {
    .cabinet { padding: 42px 22px 25px; }
    .cabinet-intro { gap: 30px; padding-bottom: 42px; }
    .eyebrow { font-size: 8px; margin-bottom: 24px; }
    .intro-note { width: 170px; padding-bottom: 0; }
    .little-spiral { font-size: 35px; margin-bottom: 16px; }
    .intro-note p { font-size: 11px; margin-bottom: 16px; }
    .text-link { font-size: 10px; }
    .text-link span { margin-left: 12px; }
    .collection-caption { display: none; }
    .categories { gap: 20px; }
    .categories button { font-size: 10px; padding: 17px 0; }
    .collection-toolbar { margin-bottom: 22px; }
    .contact-sheet { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 16px; }
    .specimen-title { font-size: 13px; }
    .specimen-label { gap: 2px; }
    .specimen-number { font-size: 8px; }
    .corner-mark { width: 25px; height: 25px; top: 10px; right: 10px; }
    .image-invitation { left: 10px; right: 10px; bottom: 10px; padding: 10px; }
    .inspection-dialog { width: 100%; height: 100%; max-height: 100%; margin: 0; }
    .inspection { padding: 16px 20px 25px; }
    .inspection-body { grid-template-columns: 1fr; gap: 27px; }
    .inspection-topbar { position: sticky; top: 0; z-index: 2; background: #f4f2eb; margin: -16px -20px 0; padding: 16px 20px 15px; }
    .stage-frame { width: min(100%, 64svh); }
    .stage-footnote { max-width: 64svh; }
    .inspection-details { padding-top: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 25px; }
    .artwork-heading .eyebrow { margin-bottom: 12px; }
    h2 { font-size: 29px; }
    .artwork-description { margin-bottom: 0; }
    .inspection-navigation { grid-column: 1 / -1; margin-top: 3px; padding-top: 12px; border-top: 1px solid #d7d8cc; }
    .journey-label { margin-bottom: 12px; }
    .phase-description { min-height: 0; margin: 17px 0; }
  }
  @media (max-width: 480px) {
    .cabinet { padding: 32px 17px 24px; }
    .cabinet-intro { display: block; padding-bottom: 31px; }
    h1 { font-size: 63px; }
    .intro-note { width: 100%; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-top: 27px; }
    .little-spiral { display: none; }
    .intro-note p { margin: 0; font-size: 10px; }
    .text-link { font-size: 9px; }
    .text-link span { margin-left: 8px; }
    .categories { gap: 15px; width: 100%; justify-content: space-between; }
    .categories button { font-size: 9px; }
    .filter-count { font-size: 7px; margin-left: 3px; }
    .contact-sheet { gap: 23px 12px; }
    .specimen-label { grid-template-columns: 17px 1fr; padding-top: 10px; }
    .specimen-title { font-size: 12px; line-height: 1.3; }
    .collection-footnote { margin-top: 40px; font-size: 8px; }
    .inspection { padding: 12px 16px 20px; }
    .inspection-topbar { margin: -12px -16px 0; padding: 12px 16px 15px; }
    .inspection-details { display: block; }
    .artwork-description { margin-bottom: 25px; }
    .journey-controls { padding-top: 2px; }
    .phase-description { min-height: 0; margin: 17px 0; }
    .inspection-navigation { margin-top: 23px; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
</style>
