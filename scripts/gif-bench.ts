#!/usr/bin/env bun
/**
 * Headless GIF export quality benchmark and test harness.
 * 
 * Decodes the project's bundled demo JPEG, polyfills ImageData,
 * and uses the CPU renderer ('CpuEscherZoomRenderer') to render a 20-frame
 * seamless zoom animation loop. It then exports the frames into 5 comparison GIFs:
 *   1. no-dither.gif (low quality, rgb444, local palette - original behavior)
 *   2. global-no-dither.gif (high quality, rgb565, global palette, no dither)
 *   3. floyd-steinberg-strength-0.5.gif (global palette, Floyd-Steinberg dither at 50% strength)
 *   4. floyd-steinberg-strength-0.8.gif (global palette, Floyd-Steinberg dither at 80% strength)
 *   5. floyd-steinberg-strength-1.0.gif (global palette, Floyd-Steinberg dither at 100% strength)
 * 
 * Usage: `bun run scripts/gif-bench.ts`
 */

import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { CpuEscherZoomRenderer } from '../src/lib/render/escher-zoom/cpu';
import { drosteGeometry, fitCropToNest } from '../src/lib/math/droste';
import { applyPaletteWithDither } from '../src/lib/ui1/exports/dither';
import demoImage from '../src/lib/demo-image.json';

// --- Polyfills ---
class ImageDataPolyfill {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.data = data || new Uint8ClampedArray(width * height * 4);
  }
}
globalThis.ImageData = ImageDataPolyfill as any;

class MockContext2D {
  imageData: ImageDataPolyfill | null = null;
  putImageData(imageData: any, x: number, y: number) {
    this.imageData = imageData;
  }
}

class MockCanvas {
  width = 0;
  height = 0;
  getContext(type: string) {
    if (type === '2d') {
      return new MockContext2D();
    }
    return null;
  }
}

// --- Setup directories ---
const OUT_DIR = path.join(import.meta.dirname, 'out');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// --- Main execution ---
async function main() {
  console.log(`🚀 Loading ${demoImage.name} JPEG test image...`);
  const jpegPath = path.join(import.meta.dirname, '../public', demoImage.plainImage);
  const jpegData = fs.readFileSync(jpegPath);
  const decoded = jpeg.decode(jpegData);
  
  console.log(`🖼️  Loaded JPEG image: ${decoded.width}x${decoded.height}`);
  const sourcePixels = new ImageDataPolyfill(
    decoded.width,
    decoded.height,
    new Uint8ClampedArray(decoded.data)
  );

  // Use the same source geometry as the editor and interactive explainers.
  const EXAMPLE_DEFAULT = {
    nest: demoImage.nest,
    crop: fitCropToNest(decoded, demoImage.nest)
  };

  const nestInCrop = {
    x: EXAMPLE_DEFAULT.nest.x - EXAMPLE_DEFAULT.crop.x,
    y: EXAMPLE_DEFAULT.nest.y - EXAMPLE_DEFAULT.crop.y,
    w: EXAMPLE_DEFAULT.nest.w,
    h: EXAMPLE_DEFAULT.nest.h
  };

  console.log('📐 Computing Droste Geometry...');
  const geom = drosteGeometry(
    { width: EXAMPLE_DEFAULT.crop.w, height: EXAMPLE_DEFAULT.crop.h },
    nestInCrop
  );
  
  const R0 = geom.rMax / Math.sqrt(geom.S);
  const drosteCtx = {
    cx: geom.limit.x,
    cy: geom.limit.y,
    logS: geom.logS,
    rMax: geom.rMax,
    W: EXAMPLE_DEFAULT.crop.w,
    H: EXAMPLE_DEFAULT.crop.h,
    cropX: EXAMPLE_DEFAULT.crop.x,
    cropY: EXAMPLE_DEFAULT.crop.y,
    sampleScale: 1,
    shapeMorph: demoImage.shape === 'ellipse' ? 0 : 1
  };

  // Dimensions of rendering frame (ANIMATED_MAX_W = 360)
  const scale = Math.min(1, 360 / EXAMPLE_DEFAULT.crop.w);
  const W = Math.round(EXAMPLE_DEFAULT.crop.w * scale);
  const H = Math.round(EXAMPLE_DEFAULT.crop.h * scale);
  console.log(`🎥 Canvas render dimensions: ${W}x${H}`);

  console.log('⏳ Rendering 20 frames of "tententoon zoom"...');
  const renderer = new CpuEscherZoomRenderer();
  const mockCanvas = new MockCanvas();
  renderer.init(mockCanvas as any);

  const totalFrames = 20;
  const frames: Uint8ClampedArray[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const input = {
      pixels: sourcePixels as any,
      ctx: drosteCtx,
      R0,
      W,
      H,
      scale,
      t
    };
    renderer.render(input);
    const ctx = (renderer as any).ctx2d as MockContext2D;
    // Copy the rendered frame pixels so we don't hold the same buffer reference
    const frameData = new Uint8ClampedArray(ctx.imageData!.data);
    frames.push(frameData);
  }
  console.log(`✅ Rendered all ${totalFrames} frames.`);

  // --- BENCHMARK RUNS ---
  const results: Array<{
    name: string;
    description: string;
    sizeKb: number;
    timeMs: number;
  }> = [];

  const runBench = (
    fileName: string,
    description: string,
    encodeFn: (frames: Uint8ClampedArray[]) => Uint8Array
  ) => {
    console.log(`\n📦 Encoding: ${fileName} (${description})...`);
    const start = performance.now();
    const gifBytes = encodeFn(frames);
    const end = performance.now();
    const timeMs = Math.round(end - start);
    
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(gifBytes));
    const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
    
    console.log(`   └─ Done in ${timeMs}ms | File Size: ${sizeKb} KB`);
    results.push({ name: fileName, description, sizeKb, timeMs });
  };

  // 1. Original behavior: Per-frame local palette, rgb444, no dither
  runBench('no-dither.gif', 'Original: rgb444 local palette, no dither', (framesList) => {
    const enc = GIFEncoder();
    for (let i = 0; i < framesList.length; i++) {
      const rgba = framesList[i];
      const palette = quantize(rgba, 256, { format: 'rgb444' });
      const indexed = applyPalette(rgba, palette, 'rgb444');
      enc.writeFrame(indexed, W, H, { palette, delay: 80 });
    }
    enc.finish();
    return enc.bytes();
  });

  // 2. Global palette, rgb565, no dither
  runBench('global-no-dither.gif', 'Global: rgb565 unified palette, no dither', (framesList) => {
    const enc = GIFEncoder();
    
    // Sample pixels to generate a global palette
    const samplePixels: number[] = [];
    for (let f = 0; f < framesList.length; f += 2) {
      const rgba = framesList[f];
      for (let i = 0; i < rgba.length; i += 16) {
        samplePixels.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
      }
    }
    const globalPalette = quantize(new Uint8Array(samplePixels), 256, { format: 'rgb565' });

    for (let i = 0; i < framesList.length; i++) {
      const rgba = framesList[i];
      const indexed = applyPalette(rgba, globalPalette, 'rgb565');
      enc.writeFrame(indexed, W, H, {
        palette: i === 0 ? globalPalette : null,
        delay: 80
      });
    }
    enc.finish();
    return enc.bytes();
  });

  // 3. Global palette, Floyd-Steinberg dither (strength 0.5)
  runBench('floyd-steinberg-strength-0.5.gif', 'Dither: F-S dither (50% strength)', (framesList) => {
    return encodeWithGlobalDither(framesList, W, H, 0.5);
  });

  // 4. Global palette, Floyd-Steinberg dither (strength 0.8)
  runBench('floyd-steinberg-strength-0.8.gif', 'Dither: F-S dither (80% strength)', (framesList) => {
    return encodeWithGlobalDither(framesList, W, H, 0.8);
  });

  // 5. Global palette, Floyd-Steinberg dither (strength 1.0)
  runBench('floyd-steinberg-strength-1.0.gif', 'Dither: F-S dither (100% strength)', (framesList) => {
    return encodeWithGlobalDither(framesList, W, H, 1.0);
  });

  // --- Display table of results ---
  console.log('\n📊 === BENCHMARK RESULTS ===');
  console.table(results.map(r => ({
    'File Name': r.name,
    'Configuration': r.description.split(': ')[1],
    'Size (KB)': `${r.sizeKb} KB`,
    'Encoding Time (ms)': `${r.timeMs} ms`
  })));
  console.log(`\n🎉 All comparison GIFs generated successfully in: ${OUT_DIR}`);
}

function encodeWithGlobalDither(
  framesList: Uint8ClampedArray[],
  width: number,
  height: number,
  strength: number
): Uint8Array {
  const enc = GIFEncoder();
  
  // Sample pixels to generate a global palette
  const samplePixels: number[] = [];
  const sampleStep = Math.max(1, Math.floor(framesList.length / 10));
  for (let f = 0; f < framesList.length; f += sampleStep) {
    const rgba = framesList[f];
    for (let i = 0; i < rgba.length; i += 16) {
      samplePixels.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  
  const globalPalette = quantize(new Uint8Array(samplePixels), 256, { format: 'rgb565' });

  for (let i = 0; i < framesList.length; i++) {
    const rgba = framesList[i];
    const indexed = applyPaletteWithDither(rgba, globalPalette, width, height, { strength });
    
    enc.writeFrame(indexed, width, height, {
      palette: i === 0 ? globalPalette : null,
      delay: 80
    });
  }
  
  enc.finish();
  return enc.bytes();
}

main().catch(console.error);
