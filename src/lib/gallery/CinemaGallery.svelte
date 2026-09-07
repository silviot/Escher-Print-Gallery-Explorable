<script lang="ts">
  import { onMount } from 'svelte';
  import ArtworkStage from './ArtworkStage.svelte';
  import type { GalleryProps, GalleryItem } from './types';

  let { items, initialId, onselect }: GalleryProps = $props();
  let selected = $state('');
  let item = $derived(items.find(i => i.id === (selected || initialId)) ?? items[0]);
  let index = $derived(items.indexOf(item));
  let progress = $state(0);
  let playing = $state(false);
  let journey = $state(false);
  let reduced = $state(false);
  let stage = $derived(progress < .5 ? 0 : progress < 1.5 ? 1 : 2);
  let strip: HTMLDivElement;
  let frame: HTMLDivElement;
  let journeyTime = 0;
  const steps = [
    { name: 'Original', description: 'A world, held still.' },
    { name: 'Droste', description: 'The whole picture, inside itself.' },
    { name: 'tententoon', description: 'The repetition becomes a spiral.' }
  ];
  function choose(next: GalleryItem) {
    selected = next.id; progress = 0; playing = false; journey = false;
    onselect?.(next);
    requestAnimationFrame(() => strip?.querySelector<HTMLButtonElement>(`[data-image="${next.id}"]`)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest', inline: 'center' }));
  }
  function jump(value: number) { progress = value; journey = false; playing = false; }
  function enter() {
    if (reduced) { jump(stage === 2 ? 0 : stage + 1); return; }
    if (playing || journey) { playing = false; journey = false; return; }
    if (progress >= 1.99) { playing = true; return; }
    journeyTime = progress < 1 ? progress * 3.2 : 4.8 + (progress - 1) * 4.4;
    journey = true; playing = true;
  }
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduced = media.matches; if (reduced) { playing = false; journey = false; } };
    change(); media.addEventListener('change', change);
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, .05); last = now;
      if (journey && !document.hidden) {
        journeyTime += dt;
        // Let the eye settle on the nested image before the spiral opens.
        progress = journeyTime < 3.2 ? journeyTime / 3.2 : journeyTime < 4.8 ? 1 : Math.min(2, 1 + (journeyTime - 4.8) / 4.4);
        if (progress === 2) journey = false;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); media.removeEventListener('change', change); };
  });
</script>

<section class="cinema" aria-label="Cinema gallery">
  <div class="screening">
    <div class="introduction">
      <p class="eyebrow"><span></span> A collection of impossible pictures</p>
      <h1>A picture.<br /> A way <em>in.</em></h1>
      <p class="invitation">Look a little longer.<br />There’s another world in this one.</p>
      <div class="art-caption" aria-live="polite">
        <span class="edition">{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')} · {item.category}</span>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
      </div>
    </div>

    <div class="picture-column">
      <div class="picture" bind:this={frame}>
        <ArtworkStage {item} {progress} {playing} />
        <button class="expand" aria-label="View image fullscreen" onclick={() => frame.requestFullscreen?.()}>⤢</button>
      </div>
      <div class="under-picture">
        <span class="live-mark" class:running={playing}><i></i>{playing ? 'In motion' : 'Take your time'}</span>
        <div class="arrows">
          <button aria-label="Previous image" onclick={() => choose(items[(index - 1 + items.length) % items.length])}>←</button>
          <button aria-label="Next image" onclick={() => choose(items[(index + 1) % items.length])}>→</button>
        </div>
      </div>
    </div>

    <div class="journey">
      <p class="eyebrow">Three ways of seeing</p>
      <div class="steps">
        {#each steps as step, i}
          <button class:active={stage === i} onclick={() => jump(i)} aria-pressed={stage === i}>
            <span class="step-number">0{i + 1}</span>
            <span><strong>{step.name}</strong><small>{step.description}</small></span>
          </button>
        {/each}
      </div>
      <label class="scrubber">Find the in-between
        <input type="range" min="0" max="2" step=".001" value={progress} aria-label="Original to Droste to tententoon" aria-valuetext={steps[stage].name} oninput={e => jump(+e.currentTarget.value)} />
      </label>
      <button class="enter" onclick={enter}>{reduced ? (stage === 2 ? 'Back to original' : 'Next stage') : (playing || journey ? 'Pause the journey' : progress >= 1.99 ? 'Let it drift' : 'Enter the image')}<span aria-hidden="true">{playing || journey ? 'Ⅱ' : '↗'}</span></button>
      <p class="footnote">One image. No last image.</p>
    </div>
  </div>

  <div class="collection-label"><span>The collection</span><span>Choose another way in <span aria-hidden="true">↓</span></span></div>
  <div class="filmstrip" bind:this={strip} aria-label="Choose an image">
    {#each items as artwork, i}
      <button class:selected={artwork.id === item.id} data-image={artwork.id} onclick={() => choose(artwork)} aria-label={`Open ${artwork.title}`} aria-pressed={artwork.id === item.id}>
        <img src={artwork.thumbnail} alt={artwork.alt} loading="lazy" />
        <span>{String(i + 1).padStart(2, '0')}<b>{artwork.title}</b></span>
      </button>
    {/each}
  </div>
  <p class="source-note">Original shows the source image. Droste repeats it. tententoon bends the repetition.</p>
</section>

<style>
  .cinema { color: #edece4; background: #171b19; padding: 35px clamp(20px, 4vw, 72px) 28px; }
  .screening { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: minmax(170px, .8fr) minmax(300px, 2fr) minmax(170px, .7fr); gap: clamp(24px, 3.4vw, 58px); align-items:center; }
  .eyebrow { font: 10px/1.7 system-ui; letter-spacing: .14em; text-transform: uppercase; color: #adb5aa; }
  .introduction > .eyebrow { max-width: 160px; }
  .eyebrow > span { display: inline-block; width: 5px; height: 5px; background: #c8dda2; border-radius: 50%; margin-right: 6px; }
  h1 { font: 400 clamp(38px, 4.6vw, 68px)/1.04 Georgia, serif; letter-spacing: -.05em; margin: 28px 0 20px; }
  h1 em { color: #c5d9ad; font-weight: 400; }
  .invitation { color: #a5aaa3; font: 13px/1.7 system-ui; }
  .art-caption { margin-top: clamp(30px, 7vh, 80px); }
  .edition { color: #8f9b8e; font: 10px/1.5 system-ui; letter-spacing: .05em; }
  h2 { font: 400 22px/1.2 Georgia, serif; margin: 12px 0; }
  .art-caption p { font: 12px/1.7 system-ui; color: #a9b0a6; max-width: 220px; }
  .picture { position: relative; background: #10120f; box-shadow: 0 25px 80px #0004; }
  .picture:fullscreen { display: flex; align-items: center; justify-content: center; }
  .picture:fullscreen :global(.artwork-stage) { max-width: 100vh; }
  .expand { position: absolute; bottom: 10px; right: 10px; color: #fff; background: #0006; border: 1px solid #fff3; width: 32px; height: 32px; border-radius: 50%; font-size:20px; cursor: pointer; }
  .under-picture { display:flex; justify-content:space-between; align-items:center; margin-top:12px; }
  .live-mark { font: 10px system-ui; letter-spacing:.06em; color:#a5afa1; display:flex; gap:7px; align-items:center; }
  .live-mark i { width:5px; height:5px; background:#788071; border-radius:50%; }
  .live-mark.running i { background:#cee8a8; box-shadow:0 0 10px #b6d7836b; }
  .arrows { display:flex; gap:7px; }
  .arrows button { width:36px; height:32px; border:1px solid #475045; color:#dfe6d9; background:transparent; font-size:18px; cursor:pointer; }
  .journey { padding-bottom: 28px; }
  .steps { position:relative; margin:26px 0 28px; }
  .steps:before { content:''; position:absolute; left:11px; width:1px; top:16px; bottom:37px; background:#4a5146; }
  .steps button { display:flex; gap:14px; position:relative; text-align:left; width:100%; color:#969f92; border:0; background:transparent; padding:13px 0 20px; cursor:pointer; }
  .step-number { border:1px solid #545e4e; border-radius:50%; display:grid; place-items:center; flex:0 0 23px; height:23px; font:9px system-ui; background:#171b19; transition:background .3s; }
  .steps strong { display:block; font:400 19px Georgia,serif; }
  .steps small { display:block; font:11px/1.6 system-ui; margin-top:7px; max-width:155px; }
  .steps button.active { color:#e4edd9; }
  .active .step-number { background:#c5d9ad; color:#263322; border-color:#c5d9ad; }
  .scrubber { display:block; font:10px system-ui; color:#b5bdb0; }
  input[type=range] { display:block; accent-color:#d0e2b8; width:100%; margin:15px 0 24px; cursor:ew-resize; height:18px; }
  .enter { display:flex; align-items:center; justify-content:space-between; width:100%; gap:10px; border:1px solid #c5d9ad; color:#1c2818; background:#c5d9ad; padding:14px 13px; font:11px system-ui; cursor:pointer; }
  .enter span { font-size:19px; line-height:14px; }
  .footnote { color:#798775; font:italic 13px Georgia,serif; margin-top:16px; }
  .collection-label { max-width:1400px; margin:25px auto 13px; border-top:1px solid #3b4338; padding-top:18px; display:flex; justify-content:space-between; color:#aab2a3; font:10px system-ui; letter-spacing:.05em; }
  .collection-label > span:last-child { color:#788673; }
  .filmstrip { display:flex; gap:12px; max-width:1400px; margin:0 auto; overflow-x:auto; padding:0 0 12px; scrollbar-width:thin; scrollbar-color:#5c6854 transparent; }
  .filmstrip button { padding:0; border:0; flex:0 0 107px; color:#b0b8aa; background:transparent; cursor:pointer; text-align:left; }
  .filmstrip img { display:block; width:107px; height:107px; object-fit:cover; opacity:.58; transition:opacity .25s, filter .25s; filter:saturate(.65); }
  .filmstrip button:hover img, .filmstrip button.selected img { opacity:1; filter:saturate(1); }
  .filmstrip button.selected img { outline:1px solid #d1e1ba; outline-offset:-3px; }
  .filmstrip button > span { display:flex; align-items:baseline; gap:7px; font:9px/1.4 system-ui; margin-top:9px; }
  .filmstrip b { font-weight:400; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
  .source-note { max-width:1400px; margin:15px auto 0; font:10px/1.6 system-ui; color:#86927d; }
  button:hover { filter:brightness(1.12); }
  button:focus-visible, input:focus-visible { outline:2px solid #dcf2b9; outline-offset:4px; }
  @media(min-width:1500px) { .screening { grid-template-columns: 260px minmax(0, 650px) 225px; justify-content:center; } }
  @media(max-width:1000px) { .screening { grid-template-columns:minmax(0,1fr) 190px; gap:28px; } .introduction { grid-column:1/-1; display:flex; align-items:baseline; gap:24px; } .introduction > .eyebrow, .invitation { display:none; } h1 { margin:0; font-size:36px; } h1 br { display:none; } .art-caption { margin:0 0 0 auto; text-align:right; max-width:45%; } .art-caption p { display:none; } h2 { font-size:20px; margin:6px 0 0; } .picture-column { width:100%; max-width:650px; justify-self:center; } }
  @media(max-width:650px) { .cinema { padding:22px 18px; } .screening { display:flex; flex-direction:column; gap:20px; } .introduction { width:100%; align-items:center; gap:12px; } h1 { font-size:30px; } .art-caption { max-width:46%; } .edition { font-size:8px; } h2 { font-size:16px; } .journey { width:100%; padding-bottom:0; } .journey > .eyebrow { display:none; } .steps { display:flex; margin:0 0 6px; gap:6px; } .steps:before { display:none; } .steps button { flex:1; gap:7px; padding:6px 0 12px; align-items:center; } .steps strong { font-size:16px; } .steps small { display:none; } .step-number { flex-basis:19px; height:19px; font-size:8px; } .scrubber { margin-top:6px; } input[type=range] { margin:8px 0 13px; } .enter { padding:13px 16px; font-size:12px; } .footnote { display:none; } .collection-label { margin-top:23px; } .filmstrip button { flex-basis:86px; } .filmstrip img { width:86px; height:86px; } }
  @media(prefers-reduced-motion:reduce) { * { transition:none !important; scroll-behavior:auto !important; } }
</style>
