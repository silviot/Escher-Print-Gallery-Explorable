import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Generate per-variant index.html files (dist/ui1/index.html, etc.) so that
 * static hosts without SPA fallback (e.g. GitHub Pages) can serve the
 * pathname routes directly. We start from the built dist/index.html and
 * rewrite its relative `./assets/...` references to `../assets/...` so the
 * one-level-deep variant page still finds the same bundle.
 *
 * Add new variants here as they're added to App.svelte's route switch.
 */
function generateVariantPages(): Plugin {
  const VARIANTS = ['ui1'];
  return {
    name: 'generate-variant-pages',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist');
      const indexPath = resolve(outDir, 'index.html');
      let indexHtml: string;
      try {
        indexHtml = readFileSync(indexPath, 'utf-8');
      } catch {
        return; // no index.html — nothing to mirror
      }
      const rewritten = indexHtml
        .replace(/(\s(?:href|src)=")\.\//g, '$1../')
        .replace(/(\s(?:href|src)=")(?!\.\.\/|https?:|\/|data:|#)([^"]+)/g, '$1../$2');
      for (const variant of VARIANTS) {
        const dir = resolve(outDir, variant);
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'index.html'), rewritten);
      }
    }
  };
}

/**
 * Dev-only proxy for fal.ai upscaling.
 *
 * Browser POSTs { image_data_url, model?, factor? } to /api/upscale.
 * We forward to fal.run/{model} with the FAL_API_KEY from env, then
 * return fal's JSON response untouched. The browser fetches the
 * resulting image URL directly from fal's CDN (it serves CORS).
 *
 * Deliberately dev-only: the API key never reaches the browser. A
 * production build would need this swapped for a real backend or a
 * server-rendered route.
 */
function falUpscaleProxy(): Plugin {
  return {
    name: 'fal-upscale-proxy',
    configureServer(server) {
      server.middlewares.use('/api/upscale', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const apiKey = process.env.FAL_API_KEY;
        if (!apiKey) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'FAL_API_KEY not set in the dev server environment' }));
          return;
        }
        try {
          // Read the body. We allow up to 32 MB — generous, covers a
          // 4000×3000 PNG. fal will reject anything it can't handle.
          const chunks: Buffer[] = [];
          let total = 0;
          const MAX = 32 * 1024 * 1024;
          for await (const chunk of req) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > MAX) {
              res.statusCode = 413;
              res.end('payload too large');
              return;
            }
            chunks.push(buf);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const { image_data_url, model, factor } = body as {
            image_data_url?: string;
            model?: string;
            factor?: number;
          };
          if (!image_data_url || !image_data_url.startsWith('data:image/')) {
            res.statusCode = 400;
            res.end('image_data_url required (data:image/...)');
            return;
          }

          // Default to aura-sr — fast, 4× by default, decent on photos.
          // The schema differs per model; we pass image_url + a factor
          // hint where supported and let fal validate.
          const modelId = model ?? 'fal-ai/aura-sr';
          const falBody: Record<string, unknown> = { image_url: image_data_url };
          if (factor !== undefined) falBody.upscaling_factor = factor;

          const falRes = await fetch(`https://fal.run/${modelId}`, {
            method: 'POST',
            headers: {
              Authorization: `Key ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(falBody)
          });
          const falText = await falRes.text();
          res.statusCode = falRes.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(falText);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    }
  };
}

export default defineConfig({
  // Relative base so the built site works at any path on the host
  // (root, subdirectory, or static-file hosts like GitHub Pages).
  base: './',
  plugins: [svelte(), falUpscaleProxy(), generateVariantPages()],
  build: {
    rollupOptions: {
      input: {
        // The app, and the standalone explorable explainer (explain.html +
        // src/explain/main.ts). Two HTML entry points → dist/index.html and
        // dist/explain.html, each with its own bundled module.
        main: resolve(process.cwd(), 'index.html'),
        explain: resolve(process.cwd(), 'explain.html')
      }
    }
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true }
});
