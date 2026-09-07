<script lang="ts">
  /**
   * Consolidated playback bar (per the design_handoff_layout_redesign
   * spec): every animation control lives here so the right inspector
   * isn't taking up real estate for things the user touches once. From
   * left to right:
   *
   *   [ZOOM in/out segmented] · [▶ time scrubber] · [LENGTH slider]
   *
   * Groups are visually separated by a 1px left divider so the bar has
   * rhythm without nested boxes. Disabled state hangs off `enabled`
   * (= rect has area + image is loaded).
   */
  import Icon from './Icon.svelte';
  import MobileMenu from './MobileMenu.svelte';
  import { playback, type Direction } from '../../lib/ui1/state.svelte';
  import { phase } from '../../lib/ui1/render';
  import { markGestureEnd } from '../../lib/ui1/tententoon.svelte';

  let trackEl: HTMLDivElement;
  let scrubbing = false;
  let wasPlaying = false;

  const enabled = $derived(phase() === 'edit' || phase() === 'playing');

  function toggle() {
    if (!enabled) return;
    playback.playing = !playback.playing;
    markGestureEnd();
  }

  function setDirection(d: Direction) {
    if (!enabled) return;
    playback.direction = d;
    markGestureEnd();
  }

  function onTrackDown(e: PointerEvent) {
    if (!enabled) return;
    scrubbing = true;
    wasPlaying = playback.playing;
    playback.playing = false;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setFromEvent(e);
  }
  function onTrackMove(e: PointerEvent) {
    if (!scrubbing) return;
    setFromEvent(e);
  }
  function onTrackUp(e: PointerEvent) {
    if (!scrubbing) return;
    scrubbing = false;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch {}
    playback.playing = wasPlaying;
  }
  function setFromEvent(e: PointerEvent) {
    const rect = trackEl.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playback.t = r;
  }

  const progressPct = $derived(`${(playback.t * 100).toFixed(2)}%`);
  const elapsed = $derived(playback.t * playback.loopLength);
</script>

{#snippet zoomControls()}
    <span class="micro mono">Zoom</span>
    <div class="segmented" role="group" aria-label="Zoom direction">
      <button
        class="seg"
        class:active={playback.direction === 'in'}
        aria-pressed={playback.direction === 'in'}
        disabled={!enabled}
        onclick={() => setDirection('in')}
      >In</button>
      <button
        class="seg"
        class:active={playback.direction === 'out'}
        aria-pressed={playback.direction === 'out'}
        disabled={!enabled}
        onclick={() => setDirection('out')}
      >Out</button>
    </div>
{/snippet}

{#snippet lengthControls()}
    <span class="micro mono">Loop length</span>
    <span class="slider-row">
      <input
        class="dslider"
        type="range"
        min="1"
        max="6"
        step="0.5"
        bind:value={playback.loopLength}
        disabled={!enabled}
        aria-label="Loop length"
      />
      <span class="value mono">{playback.loopLength.toFixed(1)}s</span>
    </span>
{/snippet}

<div class="bbar">
  <div class="bgroup desktop-setting">{@render zoomControls()}</div>

  <!-- PLAY · time · scrubber -->
  <div class="bgroup grow play-group">
    <button class="play" class:on={playback.playing} disabled={!enabled} onclick={toggle} title={playback.playing ? 'Pause animation (Space)' : 'Play animation (Space)'} aria-label={playback.playing ? 'Pause animation' : 'Play animation'}>
      {#if playback.playing}
        <Icon name="pause" size={14} />
      {:else}
        <Icon name="play" size={14} />
      {/if}
      <span>{playback.playing ? 'Pause' : 'Play'}</span>
    </button>
    <span class="clock mono">{elapsed.toFixed(1)}s / {playback.loopLength.toFixed(1)}s</span>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="track"
      bind:this={trackEl}
      onpointerdown={onTrackDown}
      onpointermove={onTrackMove}
      onpointerup={onTrackUp}
      onpointercancel={onTrackUp}
    >
      <div class="rail"></div>
      <div class="fill" style="width: {progressPct}"></div>
      <div class="ticks">
        {#each Array.from({ length: 11 }) as _, i (i)}
          <span class="tick" class:major={i % 5 === 0}></span>
        {/each}
      </div>
      <div class="head" style="left: {progressPct}"></div>
    </div>
  </div>

  <div class="bgroup desktop-setting">{@render lengthControls()}</div>
  <MobileMenu label={`Loop · ${playback.loopLength}s`} description="Animation settings" above>
    {#snippet children()}
      <div class="mobile-setting">{@render zoomControls()}</div>
      <div class="mobile-setting">{@render lengthControls()}</div>
    {/snippet}
  </MobileMenu>

</div>

<style>
  .bbar {
    padding: 6px 0;
    background: var(--panel);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
    row-gap: 4px;
    min-height: 56px;
    overflow: visible;
  }
  .bgroup {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-left: 1px solid var(--border);
    height: 44px;
  }
  .bgroup:first-child { border-left: 0; }
  .grow { flex: 1; min-width: 220px; }

  .micro {
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .mono { font-family: var(--font-mono); }

  /* Segmented (Zoom, Speed) — pulled from the legacy Inspector,
     made slightly more compact for the bar. */
  .segmented {
    display: inline-flex;
    padding: 2px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 7px;
    gap: 2px;
  }
  .seg {
    min-height: 32px;
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 5px;
    background: transparent;
    border: 0;
    color: var(--muted);
    font-family: inherit;
    cursor: pointer;
  }
  .seg:hover:not(:disabled) { color: var(--ink); }
  .seg.active {
    background: var(--panel);
    color: var(--ink);
    font-weight: 600;
    box-shadow: var(--shadow);
  }
  .seg:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Play button + clock + scrubber */
  .play-group { gap: 12px; }
  .play {
    min-width: 72px;
    height: 36px;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 7px;
    border: 1px solid var(--border-strong);
    background: var(--panel-2);
    color: var(--ink);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    flex-shrink: 0;
  }
  .play.on {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .play:disabled { opacity: 0.4; cursor: not-allowed; }
  .clock {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    min-width: 96px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .track {
    flex: 1;
    position: relative;
    height: 18px;
    cursor: pointer;
    touch-action: none;
    min-width: 80px;
  }
  .rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 2px;
    background: var(--border-strong);
    border-radius: 2px;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 8px;
    height: 2px;
    background: var(--accent);
    border-radius: 2px;
  }
  .ticks {
    position: absolute;
    left: 0;
    right: 0;
    top: 13px;
    display: flex;
    justify-content: space-between;
  }
  .tick {
    width: 1px;
    height: 5px;
    background: var(--border-strong);
    opacity: 0.5;
  }
  .tick.major { opacity: 1; }
  .head {
    position: absolute;
    top: 2px;
    width: 14px;
    height: 14px;
    background: var(--panel);
    border: 2px solid var(--accent);
    border-radius: 999px;
    transform: translateX(-50%);
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    pointer-events: none;
  }

  /* LENGTH slider row */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dslider {
    width: 100px;
    accent-color: var(--accent);
  }
  .value {
    font-size: 12px;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    min-width: 38px;
    text-align: right;
  }
  @media (pointer: coarse) {
    .seg { min-height: 36px; }
    .play { height: 40px; }
  }
  .mobile-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px; }
  @media (max-width: 720px) {
    .bbar { flex-wrap: nowrap; gap: 0; padding: 4px 0; min-height: 48px; }
    .desktop-setting, .clock { display: none; }
    .bgroup { border: 0; padding: 0 10px; height: 40px; }
    .grow { min-width: 0; }
    .play-group { gap: 12px; }
    .play { min-width: 64px; }
    .track { min-width: 40px; }
    .bbar > :global(.mobile-menu) { margin-right: 8px; }
    .mobile-setting .micro { font-size: 12px; }
    .mobile-setting .dslider { width: 92px; margin: 0; }
    .mobile-setting .value { min-width: 32px; }
    .mobile-setting .slider-row { gap: 6px; }
  }
</style>
