/**
 * WebGL2 renderer for the 4-panel pipeline explorable.
 *
 * One fullscreen quad + one fragment shader (pipeline-gl.frag.glsl) that
 * handles all three derived panels via a `mode` uniform. Replaces the
 * per-pixel CPU loops in pipeline-panels.ts on the browser fast path — the
 * GPU samples with mipmaps instead of hand-rolled supersampling, so it's
 * orders of magnitude faster (and antialiased for free).
 *
 * Texture upload mirrors WebGL2EscherZoomRenderer: one upload per image,
 * cached by identity. Main-thread only — panels render a still on each rect
 * change, not a 60fps animation, so the worker tier isn't worth its
 * complexity here. Callers fall back to the CPU functions if init throws
 * (no WebGL2).
 */

import * as twgl from 'twgl.js';
import vertSrc from './escher-zoom/shader.vert.glsl?raw';
import fragSrc from './pipeline-gl.frag.glsl?raw';
import type { DrosteCtx } from '../math/transforms';

export type PanelMode = 'log' | 'rotlog' | 'escher' | 'unroll';

const MODE_CODE: Record<PanelMode, number> = { log: 0, rotlog: 1, escher: 2, unroll: 3 };

export type PipelineGLInput = {
  pixels: ImageData;
  ctx: DrosteCtx;
  mode: PanelMode;
  /** Canvas pixel dims. */
  W: number;
  H: number;
  /** log / rotlog: canvas px per log-space unit (equal on both axes). */
  pxPerUnit?: number;
  /** log / rotlog: log-radius anchored at the canvas centre (= log rMax). */
  uRef?: number;
  /** escher: canvas px per working px, and log of the orientation radius. */
  scale?: number;
  lnR0?: number;
  /** Experiment overrides (default to canonical when omitted):
   *  rot   — rotated-log rotation angle (canonical atan(logS/2π)).
   *  kTwist— tententoon twist k (canonical logS/2π).
   *  panU/panV — log-space pan applied to every panel. */
  rot?: number;
  kTwist?: number;
  panU?: number;
  panV?: number;
  /** unroll mode only: 1 = rolled-up spiral, 0 = flat rotated-log strip. */
  morph?: number;
};

export class PipelinePanelGLRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private programInfo: twgl.ProgramInfo | null = null;
  private quad: twgl.BufferInfo | null = null;
  private texture: WebGLTexture | null = null;
  private texPixels: ImageData | null = null;
  private texSampleScale = Number.NaN;
  private maxAniso = 1;

  init(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('webgl2 context unavailable');
    this.gl = gl;

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      this.maxAniso = Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number);
    }

    this.programInfo = twgl.createProgramInfo(gl, [vertSrc, fragSrc]);
    this.quad = twgl.createBufferInfoFromArrays(gl, {
      a_pos: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] }
    });
    this.quad.indices = undefined;
  }

  render(input: PipelineGLInput): void {
    const gl = this.gl;
    const canvas = this.canvas;
    const prog = this.programInfo;
    const quad = this.quad;
    if (!gl || !canvas || !prog || !quad) return;

    const { pixels, ctx: droste, mode, W, H } = input;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    this.uploadTextureIfChanged(pixels, droste.sampleScale);

    gl.viewport(0, 0, W, H);
    gl.useProgram(prog.program);
    twgl.setBuffersAndAttributes(gl, prog, quad);
    twgl.setUniforms(prog, {
      u_src: this.texture,
      u_canvas: [W, H],
      u_mode: MODE_CODE[mode],
      u_c: [droste.cx, droste.cy],
      u_logS: droste.logS,
      u_rMax: droste.rMax,
      u_workingSize: [droste.W, droste.H],
      u_crop: [droste.cropX, droste.cropY],
      u_sampleScale: droste.sampleScale,
      u_texSize: [pixels.width, pixels.height],
      u_pxPerUnit: input.pxPerUnit ?? 1,
      u_uRef: input.uRef ?? 0,
      u_scale: input.scale ?? 1,
      u_lnR0: input.lnR0 ?? 0,
      u_rot: input.rot ?? Math.atan2(droste.logS, 2 * Math.PI),
      u_kTwist: input.kTwist ?? droste.logS / (2 * Math.PI),
      u_pan: [input.panU ?? 0, input.panV ?? 0],
      u_morph: input.morph ?? 0
    });
    twgl.drawBufferInfo(gl, quad, gl.TRIANGLE_STRIP);
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.programInfo) gl.deleteProgram(this.programInfo.program);
      if (this.quad?.attribs) {
        for (const a of Object.values(this.quad.attribs)) {
          if (a.buffer) gl.deleteBuffer(a.buffer);
        }
      }
    }
    this.gl = null;
    this.canvas = null;
    this.programInfo = null;
    this.quad = null;
    this.texture = null;
    this.texPixels = null;
    this.texSampleScale = Number.NaN;
  }

  private uploadTextureIfChanged(pixels: ImageData, sampleScale: number): void {
    const gl = this.gl!;
    if (pixels === this.texPixels && sampleScale === this.texSampleScale && this.texture) return;

    if (this.texture) gl.deleteTexture(this.texture);
    const tex = gl.createTexture();
    if (!tex) throw new Error('gl.createTexture returned null');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, pixels.width, pixels.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, pixels.data
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.maxAniso > 1) {
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
    }
    this.texture = tex;
    this.texPixels = pixels;
    this.texSampleScale = sampleScale;
  }
}
