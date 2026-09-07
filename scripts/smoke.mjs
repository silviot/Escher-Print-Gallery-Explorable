#!/usr/bin/env node
/**
 * Bootstrap smoke test.
 *
 * Catches regressions in the things smoke can cheaply assert from outside
 * the browser: that the bundled sample is served as a real JPEG, that the
 * App.svelte boot effect stays one-shot, and that the WebGL capability
 * detector still refuses software contexts.
 *
 * Usage: `bun run smoke` (assumes dev server on http://localhost:5173).
 *        Set SMOKE_URL to point elsewhere.
 */

import { readFile } from 'node:fs/promises';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

let failures = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

async function head(path) {
  try {
    const res = await fetch(BASE + path, { method: 'HEAD' });
    return { status: res.status, contentType: res.headers.get('content-type') ?? '' };
  } catch (e) {
    return { status: 0, contentType: '', error: e.message };
  }
}

async function main() {
  console.log(`smoke @ ${BASE}`);
  const demo = JSON.parse(await readFile(new URL('../src/lib/demo-image.json', import.meta.url), 'utf8'));
  const samplePath = '/' + demo.plainImage;

  // 1. The committed example must be served as a real image.
  const example = await head(samplePath);
  check(
    'example image is image/*',
    example.status === 200 && example.contentType.startsWith('image/'),
    `got ${example.status} ${example.contentType}`
  );

  // 2. Decode the bytes. A 200 with image/jpeg content-type but corrupted bytes
  //    would still break the app — check the JPEG SOI marker (FF D8).
  try {
    const res = await fetch(BASE + samplePath);
    const buf = new Uint8Array(await res.arrayBuffer());
    check(
      'example bytes start with JPEG SOI marker',
      buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8,
      `length=${buf.length}, first bytes=${[...buf.slice(0, 4)].map((b) => b.toString(16)).join(' ')}`
    );
  } catch (e) {
    check('example bytes start with JPEG SOI marker', false, e.message);
  }

  // 3. The bootstrap effect must stay one-shot. Without the sentinel, an
  //    async bootRestore that throws or rejects could re-arm the effect on
  //    every reactive read inside it. The check is a static grep so a
  //    refactor that drops the sentinel fails the smoke test before it
  //    ships.
  const fs = await import('node:fs/promises');
  try {
    const src = await fs.readFile(new URL('../src/App.svelte', import.meta.url), 'utf8');
    check(
      'App.svelte bootstrap effect is one-shot (sentinel present)',
      /bootstrapped\s*=\s*true/.test(src) && /if\s*\(\s*bootstrapped/.test(src),
      'sentinel not found — regression risk: bootstrap effect can loop on errors'
    );
  } catch (e) {
    check('App.svelte readable for static checks', false, e.message);
  }

  // 4. Capability detection must refuse software WebGL2. Software-only
  //    contexts (SwiftShader, llvmpipe) are slower than the JS pixel loop
  //    for our shader; refusing them is the difference between "works
  //    poorly" and "works fast on a different tier".
  try {
    const caps = await fs.readFile(
      new URL('../src/lib/render/capabilities.ts', import.meta.url),
      'utf8'
    );
    check(
      'capability detection refuses software WebGL2',
      /SwiftShader|llvmpipe|software/i.test(caps),
      'software-renderer refusal not found — risk: slow rasteriser path is preferred over CPU JS'
    );
  } catch (e) {
    check('capabilities.ts readable', false, e.message);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nsmoke ok');
}

main().catch((e) => {
  console.error('smoke crashed:', e);
  process.exit(2);
});
