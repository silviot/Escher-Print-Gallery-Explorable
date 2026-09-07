<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ArtworkStage from './ArtworkStage.svelte';
  import type { GalleryItem } from './types';

  let { items, initialId, onselect }: {
    items: GalleryItem[];
    initialId?: string;
    onselect?: (item: GalleryItem) => void;
  } = $props();

  let selectedId = $state('');
  let progress = $state(0);
  let paused = $state(false);
  let reducedMotion = $state(false);
  let inView = $state(false);
  let story = $state<HTMLDivElement>();
  let chapterOne = $state<HTMLElement>();
  let chapterTwo = $state<HTMLElement>();
  let chapterThree = $state<HTMLElement>();

  const chapters = [
    { label: 'The picture', short: 'Original', number: '01' },
    { label: 'The picture inside', short: 'Droste', number: '02' },
    { label: 'A way through', short: 'Tententoon', number: '03' }
  ];

  const item = $derived(items.find((entry) => entry.id === (selectedId || initialId)) ?? items[0]);
  const selectedIndex = $derived(item ? items.findIndex((entry) => entry.id === item.id) : 0);
  const activeChapter = $derived(Math.min(2, Math.round(progress)));

  $effect(() => {
    if (initialId && items.some((entry) => entry.id === initialId)) selectedId = initialId;
  });

  function chapterElements() {
    return [chapterOne, chapterTwo, chapterThree];
  }

  function readingLine() {
    return window.innerHeight * (window.innerWidth < 760 ? 0.78 : 0.52);
  }

  function chapterPosition(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  }

  function readScroll() {
    if (!story || !chapterOne || !chapterTwo || !chapterThree) return;
    const first = chapterPosition(chapterOne);
    const second = chapterPosition(chapterTwo);
    const third = chapterPosition(chapterThree);
    const line = readingLine();
    const next = line <= second
      ? (line - first) / Math.max(1, second - first)
      : 1 + (line - second) / Math.max(1, third - second);
    progress = Math.max(0, Math.min(2, next));
    const bounds = story.getBoundingClientRect();
    inView = bounds.top < window.innerHeight && bounds.bottom > 100;
  }

  function goToChapter(index: number, smooth = true) {
    const chapter = chapterElements()[index];
    if (!chapter) return;
    progress = index;
    const top = window.scrollY + chapterPosition(chapter) - readingLine();
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reducedMotion ? 'smooth' : 'instant' });
  }

  async function choose(entry: GalleryItem) {
    selectedId = entry.id;
    progress = 0;
    onselect?.(entry);
    await tick();
    goToChapter(0, false);
  }

  function nextPicture() {
    const next = items[(selectedIndex + 1) % items.length];
    if (next) void choose(next);
  }

  onMount(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = motion.matches;
    paused = motion.matches;
    let frame = 0;
    const scheduleRead = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; readScroll(); });
    };
    const updateMotion = () => {
      reducedMotion = motion.matches;
      if (motion.matches) paused = true;
    };
    window.addEventListener('scroll', scheduleRead, { passive: true });
    window.addEventListener('resize', scheduleRead, { passive: true });
    motion.addEventListener('change', updateMotion);
    scheduleRead();
    return () => {
      window.removeEventListener('scroll', scheduleRead);
      window.removeEventListener('resize', scheduleRead);
      motion.removeEventListener('change', updateMotion);
      cancelAnimationFrame(frame);
    };
  });
</script>

<section class="passage" aria-label="Passage gallery">
  <header class="introduction">
    <div class="edition"><span>Passage</span><span>A collection of impossible pictures</span></div>
    <div class="opening">
      <h1>There is more<br />to a picture<br />than <em>meets the eye.</em></h1>
      <div class="invitation">
        <span class="small-star" aria-hidden="true">✳</span>
        <p>A picture. A picture inside it.<br />Then a place you can fall into.</p>
        <button class="text-button" onclick={() => goToChapter(0)}>
          Take a closer look <span aria-hidden="true">↓</span>
        </button>
      </div>
    </div>
  </header>

  {#if item}
    <div class="collection">
      <div class="collection-heading">
        <p>Choose a picture</p>
        <span>{String(selectedIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span>
      </div>
      <div class="contact-sheet" aria-label="Choose an artwork">
        {#each items as entry, index (entry.id)}
          <button class:chosen={item.id === entry.id} class="contact"
            aria-pressed={item.id === entry.id} aria-label={entry.title}
            onclick={() => choose(entry)} title={entry.title}>
            <span class="contact-image"><img src={entry.thumbnail || entry.src} alt="" loading="lazy" /></span>
            <span class="contact-caption"><span>{String(index + 1).padStart(2, '0')}</span><span>{entry.title}</span></span>
          </button>
        {/each}
      </div>
    </div>

    <div class="story" bind:this={story}>
      <div class="artwork-column">
        <div class="sticky-artwork">
          <div class="artwork-topline"><span>{item.category}</span><span aria-hidden="true">↘</span></div>
          <figure class="plate">
            <div class="picture">
              <ArtworkStage {item} {progress} playing={!paused && progress > 1.5 && inView} />
            </div>
            <figcaption><span>{item.title}</span><span class="plate-number">Plate {String(selectedIndex + 1).padStart(2, '0')}</span></figcaption>
          </figure>
          <div class="stage-controls" aria-label="Picture transformation">
            {#each chapters as chapter, index}
              <button class:current={activeChapter === index} aria-pressed={activeChapter === index}
                onclick={() => goToChapter(index)}>
                <span class="stage-number" aria-hidden="true">{chapter.number}</span><span>{chapter.short}</span>
              </button>
            {/each}
          </div>
          <div class="progress-track" aria-hidden="true"><span style:width={`${(progress / 2) * 100}%`}></span></div>
          <div class="artwork-footnote">
            <span>{activeChapter === 0 ? 'Look closely. There is already a hint.' : activeChapter === 1 ? 'The whole is hiding in a part.' : 'The picture has become a journey.'}</span>
            {#if activeChapter === 2 && !reducedMotion}
              <button class="motion-button" onclick={() => paused = !paused} aria-pressed={!paused}>
                {paused ? 'Play' : 'Pause'} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
              </button>
            {/if}
          </div>
        </div>
      </div>

      <div class="chapters">
        <article class:active={activeChapter === 0} class="chapter" bind:this={chapterOne} aria-label={chapters[0].label}>
          <div class="chapter-copy">
            <p class="chapter-kicker"><span>01</span> Begin with a picture</p>
            <h2>A little<br /> <em>impossible.</em></h2>
            <p class="body-copy">{item.description}</p>
            <p class="body-copy secondary">Stay a moment. Let your eye find the part that seems to contain more than it should.</p>
            <p class="scroll-note">Keep scrolling <span aria-hidden="true">↓</span></p>
          </div>
        </article>

        <article class:active={activeChapter === 1} class="chapter" bind:this={chapterTwo} aria-label={chapters[1].label}>
          <div class="chapter-copy">
            <p class="chapter-kicker"><span>02</span> Discover the Droste effect</p>
            <h2>Inside it,<br /> <em>all of it.</em></h2>
            <p class="body-copy">One part of this picture holds the whole picture. And inside that smaller copy? The same thing again.</p>
            <p class="body-copy secondary">This is the Droste effect. A small visual loop with no final room.</p>
            <div class="recursion-mark" aria-hidden="true"><span><span><span></span></span></span></div>
          </div>
        </article>

        <article class:active={activeChapter === 2} class="chapter" bind:this={chapterThree} aria-label={chapters[2].label}>
          <div class="chapter-copy">
            <p class="chapter-kicker"><span>03</span> Enter the tententoon</p>
            <h2>Now let<br /> <em>it unfold.</em></h2>
            <p class="body-copy">The edges bend. The copies connect. A picture inside a picture becomes a continuous passage.</p>
            <p class="body-copy secondary">That is a tententoon. Follow the image inward, and watch it return.</p>
            <button class="next-picture" onclick={nextPicture}>Try another picture <span aria-hidden="true">↗</span></button>
          </div>
        </article>
      </div>
    </div>

    <footer class="closing-note">
      <span class="closing-star" aria-hidden="true">✳</span>
      <p>The closer you look,<br /><em>the further you go.</em></p>
      <button class="text-button" onclick={nextPicture}>One more picture <span aria-hidden="true">↗</span></button>
    </footer>
  {:else}
    <p class="empty">Every passage starts with a picture. Add one to begin.</p>
  {/if}
</section>

<style>
  .passage { --paper: #f4f0e6; --ink: #32352c; --muted: #727467; --line: #d7d8c9; --accent: #737d45; background: var(--paper); color: var(--ink); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0 clamp(22px, 5vw, 100px); overflow: clip; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; }
  .introduction { max-width: 1460px; margin: auto; padding-top: clamp(28px, 4vw, 60px); }
  .edition { display: flex; justify-content: space-between; gap: 25px; border-top: 1px solid var(--ink); padding-top: 15px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
  .edition span:first-child { font-weight: 700; }
  .opening { display: flex; justify-content: space-between; align-items: flex-end; padding: clamp(45px, 6.5vw, 105px) 0 clamp(40px, 6vw, 90px); gap: 42px; }
  h1, h2, .closing-note p { font-family: 'Iowan Old Style', 'Baskerville', 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 400; }
  h1 { margin: 0; font-size: clamp(56px, 7.25vw, 116px); letter-spacing: -.065em; line-height: .95; }
  h1 em, h2 em, .closing-note em { font-weight: 400; }
  .invitation { flex: 0 1 280px; padding-bottom: 6px; }
  .small-star { display: block; color: var(--accent); font-size: 38px; line-height: 1; margin-bottom: 20px; }
  .invitation p { font-size: 15px; line-height: 1.6; margin: 0 0 28px; }
  .text-button { display: inline-flex; align-items: center; justify-content: space-between; gap: 28px; background: transparent; border: 0; border-bottom: 1px solid var(--ink); padding: 0 0 9px; font-size: 12px; }
  .text-button span { font-size: 19px; transition: transform 180ms ease; }
  .text-button:hover span { transform: translateY(3px); }
  .collection { max-width: 1460px; margin: 0 auto 22px; padding-top: 16px; border-top: 1px solid var(--line); }
  .collection-heading { display: flex; justify-content: space-between; align-items: center; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 17px; }
  .collection-heading p { margin: 0; }
  .collection-heading > span { color: var(--muted); font-variant-numeric: tabular-nums; }
  .contact-sheet { display: flex; gap: 15px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-color: #b6b9a9 transparent; scrollbar-width: thin; padding: 3px 3px 18px; margin: -3px; }
  .contact { flex: 0 0 102px; border: 0; padding: 0; text-align: left; background: transparent; }
  .contact-image { display: block; width: 100%; aspect-ratio: 1; padding: 4px; border: 1px solid transparent; box-sizing: border-box; transition: border-color 180ms ease; }
  .contact img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(.8); transition: filter 180ms ease; }
  .contact:hover img, .contact.chosen img { filter: none; }
  .contact.chosen .contact-image { border-color: var(--accent); }
  .contact-caption { display: flex; gap: 6px; font-size: 9px; line-height: 1.3; margin: 8px 4px 0; color: var(--muted); }
  .contact-caption span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chosen .contact-caption { color: var(--ink); }
  .story { display: grid; grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr); gap: clamp(35px, 7vw, 130px); max-width: 1460px; margin: auto; position: relative; }
  .artwork-column { min-width: 0; }
  .sticky-artwork { position: sticky; top: 85px; margin: 0; padding: 28px 0 20px; }
  .artwork-topline { display: flex; align-items: center; justify-content: space-between; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 12px; color: var(--muted); }
  .artwork-topline > span:last-child { color: var(--accent); font-size: 20px; line-height: 12px; }
  .picture { width: 100%; max-width: calc(100svh - 295px); margin: auto; box-shadow: 0 9px 40px #373c2910; background: #e8e4d9; }
  .plate { margin: 0; }
  figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; margin: 14px 0 24px; font-family: 'Iowan Old Style', 'Baskerville', Georgia, serif; font-size: 18px; }
  .plate-number { flex-shrink: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .stage-controls { display: flex; gap: 12px; justify-content: space-between; border-top: 1px solid var(--line); padding: 13px 0 12px; }
  .stage-controls button { display: inline-flex; align-items: center; gap: 7px; background: none; border: 0; padding: 5px 0; color: var(--muted); font-size: 11px; }
  .stage-controls button.current { color: var(--ink); }
  .stage-number { display: grid; place-items: center; width: 21px; height: 21px; border: 1px solid var(--line); border-radius: 50%; font-size: 8px; font-variant-numeric: tabular-nums; transition: background 180ms ease, color 180ms ease; }
  .current .stage-number { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .progress-track { height: 1px; background: var(--line); }
  .progress-track span { display: block; height: 100%; background: var(--accent); }
  .artwork-footnote { display: flex; align-items: flex-start; justify-content: space-between; min-height: 30px; padding-top: 13px; gap: 15px; font-size: 10px; line-height: 1.5; color: var(--muted); }
  .motion-button { border: none; background: none; padding: 0; white-space: nowrap; font-size: 10px; color: var(--ink); }
  .motion-button span { display: inline-block; width: 13px; text-align: right; }
  .chapter { min-height: 89svh; display: flex; align-items: center; padding: 50px 0; box-sizing: border-box; }
  .chapter:first-child { min-height: 82svh; }
  .chapter:last-child { min-height: 95svh; }
  .chapter-copy { max-width: 380px; }
  .chapter-kicker { font-size: 10px; letter-spacing: .1em; line-height: 1.5; text-transform: uppercase; color: var(--muted); margin: 0 0 34px; }
  .chapter-kicker span { display: inline-block; color: var(--accent); margin-right: 14px; }
  h2 { font-size: clamp(44px, 4.7vw, 76px); letter-spacing: -.055em; line-height: 1.01; margin: 0 0 30px; }
  .body-copy { font-size: 16px; line-height: 1.75; margin: 0 0 16px; max-width: 340px; }
  .body-copy.secondary { color: var(--muted); font-size: 14px; }
  .scroll-note { display: flex; align-items: center; gap: 18px; margin: 35px 0 0; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  .scroll-note span { font-size: 21px; }
  .recursion-mark { width: 50px; height: 50px; border: 1px solid #9b9f83; margin-top: 34px; display: grid; place-items: center; transform: rotate(-8deg); }
  .recursion-mark > span { width: 30px; height: 30px; }
  .recursion-mark span { display: grid; place-items: center; border: 1px solid #9b9f83; transform: rotate(-8deg); }
  .recursion-mark > span > span { width: 16px; height: 16px; }
  .recursion-mark > span > span > span { width: 7px; height: 7px; }
  .next-picture { display: inline-flex; align-items: center; gap: 36px; background: var(--ink); border: 1px solid var(--ink); color: var(--paper); border-radius: 2px; padding: 15px 18px; margin-top: 21px; font-size: 12px; transition: background 180ms ease; }
  .next-picture:hover { background: #4c5439; }
  .next-picture > span { font-size: 18px; }
  .closing-note { max-width: 1460px; border-top: 1px solid var(--line); margin: 40px auto 0; padding: 70px 0 90px; text-align: center; }
  .closing-star { color: var(--accent); font-size: 35px; }
  .closing-note p { margin: 22px 0 30px; font-size: clamp(34px, 4vw, 58px); line-height: 1.15; letter-spacing: -.035em; }
  .empty { padding: 40px 0 100px; }
  @media (min-width: 1500px) { .story { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 130px; } .chapter-copy { max-width: 460px; } }
  @media (max-width: 1000px) { .opening { gap: 30px; } .invitation { flex-basis: 210px; } h1 { font-size: 7.8vw; } .story { gap: 40px; } .body-copy { font-size: 15px; } .stage-controls { gap: 6px; } }
  @media (max-width: 759px) {
    .passage { padding: 0 22px; }
    .edition { font-size: 9px; letter-spacing: .06em; }
    .edition span:last-child { max-width: 150px; text-align: right; }
    .opening { display: block; padding: 46px 0 40px; }
    h1 { font-size: clamp(49px, 10.7vw, 78px); }
    .invitation { margin-top: 30px; display: grid; grid-template-columns: 25px 1fr; column-gap: 15px; }
    .small-star { font-size: 27px; grid-row: 1 / 3; margin: 2px 0 0; }
    .invitation p { font-size: 13px; line-height: 1.6; margin-bottom: 18px; }
    .invitation .text-button { justify-self: start; font-size: 11px; gap: 40px; }
    .contact-sheet { gap: 9px; }
    .contact { flex-basis: 80px; }
    .contact-caption { font-size: 8px; }
    .collection { margin-bottom: 4px; }
    .story { display: block; }
    .artwork-column { position: sticky; top: 0; z-index: 2; margin: 0 -22px; background: var(--paper); padding: 0 22px; border-bottom: 1px solid var(--line); }
    .sticky-artwork { position: static; padding: 12px 0 8px; }
    .artwork-topline { margin-bottom: 9px; font-size: 8px; }
    .picture { max-width: min(100%, 37svh, max(130px, calc(100svh - 440px))); }
    figcaption { margin: 10px 0 8px; font-size: 15px; }
    .plate-number { font-size: 8px; }
    .stage-controls { padding: 6px 0; }
    .stage-controls button { font-size: 10px; min-height: 32px; }
    .stage-number { width: 18px; height: 18px; }
    .artwork-footnote { min-height: 18px; padding-top: 7px; font-size: 9px; }
    .chapter, .chapter:first-child, .chapter:last-child { min-height: 78svh; padding: 35px 0; }
    .chapter-copy { max-width: 460px; width: 100%; margin: 0 auto; }
    .chapter-kicker { font-size: 9px; margin-bottom: 15px; }
    h2 { font-size: 40px; margin-bottom: 18px; }
    h2 br { display: none; }
    .body-copy { max-width: 440px; font-size: 14px; line-height: 1.65; margin-bottom: 10px; }
    .body-copy.secondary { font-size: 12px; }
    .scroll-note { margin-top: 14px; }
    .recursion-mark { margin-top: 18px; width: 38px; height: 38px; }
    .recursion-mark > span { width: 24px; height: 24px; }
    .next-picture { margin-top: 12px; padding: 12px 15px; font-size: 11px; }
    .closing-note { margin-top: 12px; padding: 45px 0 60px; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
