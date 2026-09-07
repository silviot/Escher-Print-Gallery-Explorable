#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GALLERY_URL || 'http://127.0.0.1:5186/gallery/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader']
});
const errors = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', error => errors.push(error.message));
const stage = page.locator('.artwork-stage');
const ready = () => page.locator('.artwork-stage[data-ready="true"]').waitFor();
const phase = async value => {
  await page.locator('.cinema input[type=range]').fill(String(value));
  await page.waitForFunction(p => Math.abs(Number(document.querySelector('.artwork-stage')?.getAttribute('data-progress')) - p) < .02, value);
};

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await ready();
  const original = hash(await stage.screenshot());
  await phase(1);
  const droste = hash(await stage.screenshot());
  await phase(2);
  const spiral = hash(await stage.screenshot());
  assert.notEqual(original, droste, 'Droste must change image pixels');
  assert.notEqual(droste, spiral, 'tententoon must change image pixels');
  const tiles = page.locator('.filmstrip button');
  assert.equal(await tiles.count(), 16);
  // Inspect the composited page, including any CSS masks over the renderer.
  // This strip lies outside both selected openings and clear of the controls.
  const periphery = async () => {
    const box = await page.locator('.artwork-stage .viewport').boundingBox();
    return hash(await page.screenshot({ clip: {
      x: Math.ceil(box.x + box.width * .03), y: Math.ceil(box.y + box.height * .2),
      width: Math.floor(box.width * .1), height: Math.floor(box.height * .55)
    } }));
  };
  for (const id of ['photo-coffee', 'photo-greenhouse']) {
    await page.locator(`[data-image="${id}"]`).click();
    await ready(); await stage.scrollIntoViewIfNeeded(); await phase(1);
    await page.waitForTimeout(550);
    const edge = await periphery();
    await page.waitForTimeout(350);
    assert.equal(await periphery(), edge, `${id}: paused Droste periphery must stay still`);
    await page.getByRole('button', { name: 'Resume tour', exact: true }).click();
    await page.waitForTimeout(1000);
    assert.notEqual(await periphery(), edge, `${id}: moving Droste must zoom the periphery too`);
    await page.getByRole('button', { name: 'Pause tour', exact: true }).click();
  }
  console.log('✓ Elliptical and rectangular Droste zoom the whole image; pause holds the periphery still');
  for (let index = 0; index < await tiles.count(); index++) {
    await tiles.nth(index).click();
    await ready();
    await phase(2);
    assert.equal(await page.locator('.load-state').count(), 0);
  }
  await phase(1.5);
  await page.getByRole('button', { name: 'Resume tour' }).click();
  await page.waitForTimeout(180);
  assert(Number(await page.locator('.cinema input[type=range]').inputValue()) >= 1.5, 'Resuming must not rewind the transition');
  console.log('✓ All 16 sources render; three distinct stages; resume preserves progress');

  await page.goto(new URL('cabinet.html', base).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.specimen').count(), 16);
  await page.getByRole('button', { name: /^Photographic/ }).click();
  assert.equal(await page.locator('.specimen').count(), 5);
  const tile = page.locator('.specimen').first();
  await tile.click(); await ready();
  await page.getByRole('button', { name: 'Next image', exact: true }).click();
  await ready();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
  assert(await tile.evaluate(el => el === document.activeElement), 'Dialog must restore focus');
  console.log('✓ Category filtering, image navigation, Escape, and focus restoration');

  for (const name of ['index.html', 'passage.html', 'cabinet.html']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(new URL(name, base).href, { waitUntil: 'networkidle' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must fit a phone`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'networkidle' });
  await ready();
  await page.getByRole('button', { name: 'Next stage', exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await stage.getAttribute('data-progress'), '1.00');
  const still = hash(await stage.screenshot());
  await page.waitForTimeout(400);
  assert.equal(hash(await stage.screenshot()), still, 'Reduced-motion stage must stay still');
  console.log('✓ All three phone layouts and reduced-motion stage controls');

  const cpu = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  cpu.on('pageerror', error => errors.push(error.message));
  await cpu.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return getContext.call(this, type, ...args);
    };
  });
  await cpu.goto(base, { waitUntil: 'networkidle' });
  await cpu.locator('.artwork-stage[data-ready="true"]').waitFor();
  await cpu.getByRole('button', { name: 'Next stage', exact: true }).click();
  await cpu.waitForTimeout(250);
  assert.equal(await cpu.locator('.artwork-stage').getAttribute('data-renderer'), 'cpu');
  const painted = await cpu.locator('canvas:not(.hidden)').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 30) colored++;
    return colored / (pixels.length / 4);
  });
  assert(painted > .8, 'CPU fallback must paint the image');
  await cpu.close();
  console.log('✓ CPU fallback renders without WebGL');
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('Gallery smoke passed');
} finally { await browser.close(); }
