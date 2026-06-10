#!/usr/bin/env node
/**
 * Screenshot + console-error probe for a page. Used to eyeball the
 * /experiments/* prototypes during development.
 *
 * Usage:
 *   node scripts/page-shot.mjs <url> <out.png> [--mobile] [--wait ms]
 *                              [--click "css"] [--scroll fraction]
 *
 * Prints every console message and page error to stdout; exits 1 when
 * the page raised an uncaught error. The screenshot is taken after
 * network-idle + the extra wait (default 1500 ms, animations need a
 * beat to produce a non-black first frame).
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error('usage: page-shot.mjs <url> <out.png> [--mobile] [--wait ms] [--click css] [--scroll fraction]');
  process.exit(2);
}
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};
const mobile = args.includes('--mobile');
const waitMs = Number(flag('--wait') ?? 1500);
const clickSel = flag('--click');
const scrollFrac = flag('--scroll');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  hasTouch: mobile
});

let failed = false;
page.on('console', (msg) => {
  const type = msg.type();
  if (type === 'error' || type === 'warning') {
    console.log(`[console.${type}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => {
  failed = true;
  console.log(`[pageerror] ${err.message}`);
});

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  console.log(`[goto] ${e.message}`);
  failed = true;
}
if (typeof clickSel === 'string') {
  try {
    await page.click(clickSel, { timeout: 5000 });
  } catch (e) {
    console.log(`[click ${clickSel}] ${e.message}`);
  }
}
if (typeof scrollFrac === 'string') {
  await page.evaluate((f) => {
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop = (el.scrollHeight - innerHeight) * Number(f);
  }, scrollFrac);
}
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
process.exit(failed ? 1 : 0);
