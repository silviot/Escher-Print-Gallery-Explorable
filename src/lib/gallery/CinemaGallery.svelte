<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ArtworkStage from './ArtworkStage.svelte';
  import { loadGalleryScene } from './renderer';
  import type { GalleryProps, GalleryItem } from './types';

  let { items, initialId, onselect }: GalleryProps = $props();
  let selected = $state('');
  let item = $derived(items.find(i => i.id === (selected || initialId)) ?? items[0]);
  let index = $derived(items.indexOf(item));
  let progress = $state(0);
  let touring = $state(false);
  let reduced = $state(false);
  let ready = $state(false);
  let visible = $state(false);
  let pageVisible = $state(true);
  let nextReady = $state(false);
  let nextError = $state(false);
  let preloadRetry = $state(0);
  let opacity = $state(1);
  let tourTime = $state(0);
  let handoff: 'none' | 'out' | 'in' = 'none';
  let fadeTime = 0;
  let stage = $derived(progress < .5 ? 0 : progress < 1.5 ? 1 : 2);
  let playing = $derived(touring && !reduced && ready && visible && pageVisible);
  let strip: HTMLDivElement;
  let frame: HTMLDivElement;
  let cinema: HTMLElement;
  let immersive = $state(false);
  let collectionOpen = $state(false);
  let controlsVisible = $state(true);
  let keyboardNavigation = $state(false);
  let hideControls = $derived(immersive && touring && !collectionOpen && !controlsVisible && !keyboardNavigation);
  let idleTimer: ReturnType<typeof setTimeout>;
  let restoreFocus: HTMLElement | null = null;
  let previousOverflow = '', previousScroll = { x: 0, y: 0 };
  let revealOnly = false;
  // Seconds: still image, repeat, one complete Droste loop, bend, spiral.
  const beats = { original: 5, repeat: 10, droste: 24, bend: 31, end: 47, fade: 1.2 };
  const steps = [
    { name: 'Original', description: 'A world, held still.' },
    { name: 'Droste', description: 'The whole picture, inside itself.' },
    { name: 'tententoon', description: 'The repetition becomes a spiral.' }
  ];
  const ease = (p: number) => .5 - Math.cos(Math.PI * p) / 2;
  const unease = (p: number) => Math.acos(1 - 2 * Math.max(0, Math.min(1, p))) / Math.PI;
  function progressAt(time: number) {
    if (time <= beats.original) return 0;
    if (time < beats.repeat) return ease((time - beats.original) / (beats.repeat - beats.original));
    if (time <= beats.droste) return 1;
    if (time < beats.bend) return 1 + ease((time - beats.droste) / (beats.bend - beats.droste));
    return 2;
  }
  function timeAt(value: number) {
    if (value === 0) return 0;
    if (value <= 1) return beats.original + unease(value) * (beats.repeat - beats.original);
    return beats.droste + unease(value - 1) * (beats.bend - beats.droste);
  }
  $effect(() => {
    const next = items[(index + 1) % items.length];
    void preloadRetry;
    let cancelled = false;
    nextReady = false; nextError = false;
    loadGalleryScene(next).then(() => {
      if (!cancelled) nextReady = true;
    }).catch(() => {
      if (!cancelled) nextError = true;
    });
    return () => { cancelled = true; };
  });
  function centerThumbnail(id: string) {
    requestAnimationFrame(() => {
      const button = Array.from(strip?.querySelectorAll<HTMLButtonElement>('[data-image]') ?? []).find(button => button.dataset.image === id);
      if (!button || !strip) return;
      const box = button.getBoundingClientRect(), rail = strip.getBoundingClientRect();
      // Only move the horizontal rail; never pull a phone's page down to it.
      strip.scrollTo({ left: strip.scrollLeft + box.left - rail.left - (rail.width - box.width) / 2, behavior: reduced ? 'instant' : 'smooth' });
    });
  }
  function stopTour() { touring = false; handoff = 'none'; opacity = 1; }
  function choose(next: GalleryItem) {
    stopTour();
    if (next.id !== item.id) ready = false;
    selected = next.id; progress = 0; tourTime = 0;
    onselect?.(next); centerThumbnail(next.id);
    if (immersive && collectionOpen) {
      collectionOpen = false;
      void tick().then(() => cinema.querySelector<HTMLButtonElement>('.enter')?.focus({ preventScroll: true }));
    }
  }
  function jump(value: number) { stopTour(); progress = value; tourTime = timeAt(value); }
  function enter() {
    revealControls();
    if (reduced) { jump(stage === 2 ? 0 : stage + 1); return; }
    if (touring) { stopTour(); return; }
    if (nextError) preloadRetry++;
    touring = true;
  }
  function revealControls() {
    controlsVisible = true;
    clearTimeout(idleTimer);
    if (immersive) idleTimer = setTimeout(() => { controlsVisible = false; }, 3200);
  }
  function leaveImmersive() {
    if (!immersive) return;
    immersive = false; collectionOpen = false; revealOnly = false;
    clearTimeout(idleTimer); controlsVisible = true; keyboardNavigation = false;
    document.body.style.overflow = previousOverflow;
    window.scrollTo(previousScroll.x, previousScroll.y);
    void tick().then(() => {
      const target = restoreFocus?.isConnected && restoreFocus !== document.body ? restoreFocus : cinema.querySelector<HTMLElement>('.expand');
      target?.focus({ preventScroll: true });
    });
  }
  async function exitImmersive() {
    if (document.fullscreenElement === cinema) {
      try { await document.exitFullscreen(); } catch { /* The viewport presentation can still close. */ }
    }
    leaveImmersive();
  }
  async function toggleImmersive() {
    if (immersive) { await exitImmersive(); return; }
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.body.style.overflow;
    previousScroll = { x: window.scrollX, y: window.scrollY };
    document.body.style.overflow = 'hidden';
    immersive = true; collectionOpen = false; keyboardNavigation = false;
    revealControls();
    // Request in the original user gesture. Fixed positioning also supports
    // browsers that do not offer element fullscreen, including mobile Safari.
    const request = cinema.requestFullscreen?.();
    void tick().then(() => cinema.focus({ preventScroll: true }));
    try { await request; } catch { /* Keep the viewport presentation. */ }
  }
  async function toggleCollection() {
    collectionOpen = !collectionOpen; revealControls();
    if (collectionOpen) {
      stopTour(); await tick(); centerThumbnail(item.id);
      strip.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    } else {
      await tick(); cinema.querySelector<HTMLButtonElement>('.collection-toggle')?.focus({ preventScroll: true });
    }
  }
  function imageReady(loaded: GalleryItem) { if (loaded.id === item.id) ready = true; }
  function imageError(failed: GalleryItem) { if (failed.id === item.id) { ready = false; stopTour(); } }
  function advance() {
    const next = items[(index + 1) % items.length];
    if (next.id !== item.id) ready = false;
    selected = next.id; progress = 0; tourTime = 0;
    handoff = 'in'; fadeTime = 0; opacity = 0;
    onselect?.(next); centerThumbnail(next.id);
  }
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduced = media.matches; if (reduced) stopTour(); };
    change(); touring = !reduced;
    media.addEventListener('change', change);
    const visibility = () => { pageVisible = !document.hidden; };
    visibility(); document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.intersectionRatio >= .2; }, { threshold: [0, .2] });
    observer.observe(frame);
    const fullscreenChange = () => {
      // Read the actual state even if entry and exit events arrive together.
      // The fixed-viewport fallback never emits a fullscreenchange event.
      if (immersive && document.fullscreenElement !== cinema) leaveImmersive();
    };
    const pointerActivity = () => { if (immersive) { keyboardNavigation = false; revealControls(); } };
    const pointerDown = () => { revealOnly = hideControls; pointerActivity(); };
    const pointerCancel = () => { revealOnly = false; };
    const revealClick = (event: MouseEvent) => {
      // A touch's compatibility click can target a control that appeared
      // after pointerdown. The first tap should only bring the controls back.
      if (revealOnly) { revealOnly = false; event.preventDefault(); event.stopPropagation(); }
    };
    const focusChange = (event: FocusEvent) => {
      if (!immersive) return;
      if (!cinema.contains(event.target as Node)) cinema.focus({ preventScroll: true });
      if (keyboardNavigation) revealControls();
    };
    const keydown = (event: KeyboardEvent) => {
      revealOnly = false;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = target?.isContentEditable || target?.closest('input, textarea, select');
      if (!immersive && !cinema.contains(target) && target !== document.body) return;
      if (immersive) { keyboardNavigation = true; revealControls(); }
      if (event.key === 'Escape' && immersive) { event.preventDefault(); void exitImmersive(); return; }
      if (event.key === 'Tab' && immersive) {
        const focusable = Array.from(cinema.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'))
          .filter(el => !el.closest('[inert]') && el.getClientRects().length > 0);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === cinema)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !cinema.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (editing || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleImmersive(); }
      else if (immersive && event.code === 'Space' && !target?.closest('button, a')) { event.preventDefault(); enter(); }
      else if (immersive && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault(); choose(items[(index + (event.key === 'ArrowLeft' ? -1 : 1) + items.length) % items.length]);
      }
    };
    document.addEventListener('fullscreenchange', fullscreenChange);
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusChange);
    cinema.addEventListener('pointermove', pointerActivity);
    cinema.addEventListener('pointerdown', pointerDown);
    cinema.addEventListener('pointercancel', pointerCancel);
    cinema.addEventListener('click', revealClick, true);
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, .05); last = now;
      if (playing) {
        if (handoff === 'out' || handoff === 'in') {
          fadeTime = Math.min(beats.fade, fadeTime + dt);
          opacity = handoff === 'out' ? 1 - ease(fadeTime / beats.fade) : ease(fadeTime / beats.fade);
          if (fadeTime >= beats.fade) {
            if (handoff === 'out') advance();
            else { handoff = 'none'; opacity = 1; }
          }
        } else {
          tourTime = Math.min(beats.end, tourTime + dt);
          progress = progressAt(tourTime);
          if (tourTime >= beats.end && nextReady) { handoff = 'out'; fadeTime = 0; }
          else if (tourTime >= beats.end && nextError) stopTour();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect();
      media.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreenChange);
      document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focusChange);
      cinema.removeEventListener('pointermove', pointerActivity); cinema.removeEventListener('pointerdown', pointerDown);
      cinema.removeEventListener('pointercancel', pointerCancel);
      cinema.removeEventListener('click', revealClick, true);
      clearTimeout(idleTimer);
      if (immersive) { document.body.style.overflow = previousOverflow; }
    };
  });
</script>

<section class="cinema" class:immersive class:controls-hidden={hideControls} bind:this={cinema} role={immersive ? 'dialog' : 'region'} aria-modal={immersive ? 'true' : undefined} tabindex="-1" aria-label="Cinema gallery" data-touring={touring} data-tour-time={tourTime.toFixed(2)}>
  {#if immersive}
    <div class="cinema-overlay">
      <div class="now-showing" aria-live="polite"><span>{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')} <i>·</i> {steps[stage].name}</span><h2>{item.title}</h2></div>
      <div class="presentation-actions">
        <button class="collection-toggle" aria-expanded={collectionOpen} onclick={toggleCollection}>{collectionOpen ? 'Close collection' : 'Collection'} <span aria-hidden="true">▦</span></button>
        <button class="exit-fullscreen" onclick={exitImmersive}>Exit <span aria-hidden="true">↙</span><kbd>Esc</kbd></button>
      </div>
    </div>
  {/if}
  <div class="screening" inert={immersive && collectionOpen}>
    <div class="introduction">
      <p class="eyebrow"><span></span> Ordinary pictures. Look again.</p>
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
        <div class="projection" style:opacity={opacity}><ArtworkStage {item} {progress} {playing} onready={imageReady} onerror={imageError} /></div>
        <button class="expand" onclick={toggleImmersive}><span aria-hidden="true">⤢</span> Fullscreen <kbd>F</kbd></button>
      </div>
      <div class="under-picture">
        <span class="live-mark" class:running={playing}><i></i>{touring ? (visible && pageVisible ? (progress === 0 ? 'A moment with the original' : 'The tour is unfolding') : 'The tour is waiting') : 'Take your time'}</span>
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
      <button class="enter" onclick={enter}>{reduced ? (stage === 2 ? 'Back to original' : 'Next stage') : (touring ? 'Pause tour' : nextError ? 'Retry tour' : 'Resume tour')}<span aria-hidden="true">{touring ? 'Ⅱ' : '↗'}</span></button>
      <p class="footnote">{reduced ? 'One image. No last image.' : nextError && !touring ? 'The next image couldn’t load. Try the tour again.' : touring ? 'Each picture takes its time. The next follows.' : 'Your pace. Resume whenever you like.'}</p>
    </div>
  </div>

  <div class="collection" class:open={collectionOpen} inert={immersive && !collectionOpen}>
  <div class="collection-label"><span>The collection</span><span>{immersive ? 'Choose a picture. Stay a while.' : 'Choose another way in'} <span aria-hidden="true">↓</span></span></div>
  <div class="filmstrip" bind:this={strip} aria-label="Choose an image">
    {#each items as artwork, i}
      <button class:selected={artwork.id === item.id} data-image={artwork.id} onclick={() => choose(artwork)} aria-label={`Open ${artwork.title}`} aria-pressed={artwork.id === item.id}>
        <img src={artwork.thumbnail} alt={artwork.alt} loading="lazy" />
        <span>{String(i + 1).padStart(2, '0')}<b>{artwork.title}</b></span>
      </button>
    {/each}
  </div>
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
  .projection { width:100%; }
  .expand { position:absolute; bottom:12px; right:12px; display:flex; align-items:center; gap:8px; color:#fff; background:#111a14cf; backdrop-filter:blur(12px); border:1px solid #fff3; border-radius:6px; padding:9px 11px; font:11px system-ui; cursor:pointer; }
  .expand > span { font-size:20px; line-height:1; }
  kbd { font:9px system-ui; opacity:.55; border:1px solid currentColor; border-radius:3px; padding:2px 4px; margin-left:6px; }
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
  .cinema.immersive { position:fixed; inset:0; z-index:1000; width:100%; height:100%; height:100dvh; box-sizing:border-box; padding:0; overflow:hidden; background:#080b09; outline:none; }
  .immersive::backdrop { background:#080b09; }
  .immersive .screening { display:block; width:100%; height:100%; max-width:none; margin:0; }
  .immersive .introduction, .immersive .source-note, .immersive .expand,
  .immersive .under-picture .live-mark, .immersive .journey > .eyebrow, .immersive .footnote { display:none; }
  .immersive .picture-column { position:absolute; inset:0; width:100%; height:100%; max-width:none; }
  .immersive .picture { width:100%; height:100%; display:grid; place-items:center; background:#080b09; box-shadow:none; }
  .immersive .projection { width:min(100vw, 100dvh); max-width:100%; }
  .immersive :global(.artwork-stage) { background:transparent; }
  .cinema-overlay { position:absolute; z-index:4; top:0; left:0; right:0; display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:max(26px, env(safe-area-inset-top)) max(28px, env(safe-area-inset-right)) 54px max(28px, env(safe-area-inset-left)); background:linear-gradient(#060a08a6, transparent); pointer-events:none; }
  .now-showing { max-width:65%; text-shadow:0 1px 12px #000; }
  .now-showing > span { color:#c5d1bc; font:10px/1.5 system-ui; letter-spacing:.08em; }
  .now-showing i { font-style:normal; padding:0 8px; opacity:.6; }
  .now-showing h2 { color:#f2f1e9; font-size:24px; margin:7px 0 0; }
  .presentation-actions { display:flex; gap:9px; pointer-events:auto; }
  .presentation-actions button { display:flex; gap:8px; align-items:center; color:#edf1e7; background:#0b130dbf; border:1px solid #ffffff2e; border-radius:6px; padding:11px 13px; font:11px system-ui; cursor:pointer; backdrop-filter:blur(16px); }
  .presentation-actions button > span { font-size:16px; }
  .immersive .under-picture { position:absolute; inset:0; margin:0; pointer-events:none; }
  .immersive .arrows { width:100%; padding:0 24px; box-sizing:border-box; justify-content:space-between; }
  .immersive .arrows button { width:44px; height:52px; border-color:#ffffff25; background:#09120c87; border-radius:7px; backdrop-filter:blur(10px); font-size:22px; pointer-events:auto; }
  .immersive .journey { position:absolute; z-index:3; bottom:max(24px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); width:min(620px, calc(100% - 48px)); box-sizing:border-box; display:grid; grid-template-columns:minmax(0, 1fr) 148px; gap:8px 24px; padding:14px 20px; border:1px solid #ffffff24; border-radius:12px; background:#101911d9; backdrop-filter:blur(20px); box-shadow:0 8px 50px #0004; }
  .immersive .steps { grid-column:1 / -1; display:flex; gap:20px; margin:0; }
  .immersive .steps:before { display:none; }
  .immersive .steps button { flex:1; gap:9px; align-items:center; padding:3px 0 9px; }
  .immersive .steps strong { font-size:17px; }
  .immersive .steps small { display:none; }
  .immersive .step-number { flex-basis:21px; height:21px; background:transparent; }
  .immersive .active .step-number { background:#c5d9ad; }
  .immersive .scrubber { align-self:center; margin:0; color:#a6b59d; font-size:9px; }
  .immersive input[type=range] { margin:7px 0 0; height:15px; }
  .immersive .enter { align-self:center; border-radius:5px; padding:12px; font-size:11px; }
  .immersive .collection { display:none; position:absolute; z-index:5; left:0; right:0; bottom:0; padding:22px 28px max(26px, env(safe-area-inset-bottom)); background:linear-gradient(#101a13f5, #111a14); border-top:1px solid #ffffff24; box-shadow:0 -16px 65px #0005;  }
  .immersive .collection.open { display:block; }
  .immersive .collection-label { margin:0 auto 15px; padding:0; border:0; }
  .immersive .filmstrip { padding-bottom:7px; }
  .immersive .filmstrip button { flex-basis:115px; }
  .immersive .filmstrip img { width:115px; height:115px; }
  .immersive .cinema-overlay, .immersive .under-picture, .immersive .journey { transition:opacity .65s; }
  .immersive.controls-hidden { cursor:none; }
  .immersive.controls-hidden .cinema-overlay, .immersive.controls-hidden .under-picture, .immersive.controls-hidden .journey { opacity:0; pointer-events:none; }
  .immersive.controls-hidden .presentation-actions, .immersive.controls-hidden .arrows button { pointer-events:none; }
  @media(max-width:650px) {
    .cinema-overlay { gap:12px; padding: max(18px, env(safe-area-inset-top)) 16px 40px; }
    .now-showing { max-width:50%; }
    .now-showing h2 { font-size:20px; line-height:1.15; }
    .now-showing > span { font-size:9px; }
    .now-showing i { padding:0 3px; }
    .presentation-actions { gap:6px; }
    .presentation-actions button { padding:10px; min-height:42px; font-size:10px; gap:6px; }
    .presentation-actions kbd, .collection-toggle > span, .expand kbd { display:none; }
    .immersive .arrows { padding:0 10px; }
    .immersive .arrows button { width:34px; height:46px; }
    .immersive .journey { width:calc(100% - 24px); bottom:max(14px, env(safe-area-inset-bottom)); padding:13px 14px; gap:8px 14px; grid-template-columns:minmax(0, 1fr) 124px; }
    .immersive .steps { gap:8px; }
    .immersive .steps button { gap:7px; }
    .immersive .steps strong { font-size:15px; }
    .immersive .step-number { flex-basis:18px; height:18px; font-size:8px; }
    .immersive .collection { padding:18px 18px max(20px, env(safe-area-inset-bottom)); }
    .immersive .collection-label > span:last-child { font-size:9px; }
  }
  @media(max-height:500px) and (min-width:651px) {
    .cinema-overlay { padding:14px 18px 32px; }
    .now-showing h2 { font-size:20px; }
    .immersive .journey { width:min(660px, calc(100% - 120px)); bottom:12px; padding:10px 16px; gap:3px 20px; }
    .immersive .steps button { padding:0 0 3px; }
    .immersive .steps strong { font-size:14px; }
    .immersive .step-number { height:18px; flex-basis:18px; }
    .immersive .enter { padding:10px; }
  }
  @media(prefers-reduced-motion:reduce) { * { transition:none !important; scroll-behavior:auto !important; } }
</style>
