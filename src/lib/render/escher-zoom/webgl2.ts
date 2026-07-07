/**
 * WebGL2 implementation of the Escher spiral-zoom panel.
 *
 * Uses twgl for the boilerplate (program compile, attribute setup, uniform
 * type-routing). One fullscreen quad, one fragment shader. The source image
 * is uploaded once per (image, sampleScale) change and sampled with mipmap
 * + anisotropic filtering — replacing the hand-rolled SS_OFFSETS adaptive
 * supersampling in the CPU backend with the GPU's built-in trilinear/aniso
 * sampler.
 *
 * Used on both the main thread (Safari < 17 etc.) and inside a Web Worker
 * via OffscreenCanvas — the same code, the canvas type just differs.
 *
 * Context loss: a `webglcontextlost` triggers `onContextLost` (set by the
 * caller), which is expected to demote to the CPU backend. We don't try to
 * re-init in place; demotion is simpler and the user has already paid the
 * cost of the GL driver hiccup.
 */

import * as twgl from 'twgl.js';
import vertSrc from './shader.vert.glsl?raw';
import fragSrc from './shader.frag.glsl?raw';
import type { EscherZoomInput, EscherZoomRenderer } from './input';

export type WebGL2Options = {
  /** Called when `webglcontextlost` fires. Caller should demote to CPU. */
  onContextLost?: () => void;
  /**
   * Keep the drawing buffer intact across composition. Needed when the
   * caller wants to read pixels / drawImage off the canvas after render
   * (e.g. PNG export). Off by default — the live preview repaints every
   * frame so there's nothing to preserve.
   */
  preserveDrawingBuffer?: boolean;
};

export class WebGL2EscherZoomRenderer implements EscherZoomRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private programInfo: twgl.ProgramInfo | null = null;
  private quad: twgl.BufferInfo | null = null;
  private texture: WebGLTexture | null = null;
  /** Last uploaded source pixels. Same-size images still need a new texture. */
  private texPixels: ImageData | null = null;
  private texSampleScale = Number.NaN;
  private maxAniso = 1;
  private contextLost = false;

  constructor(private opts: WebGL2Options = {}) {}

  init(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: this.opts.preserveDrawingBuffer ?? false,
      premultipliedAlpha: false
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('webgl2 context unavailable');
    this.gl = gl;

    canvas.addEventListener?.('webglcontextlost', this.handleContextLost as EventListener);

    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      this.maxAniso = Math.min(
        4,
        gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
      );
    }

    this.programInfo = twgl.createProgramInfo(gl, [vertSrc, fragSrc]);
    this.quad = twgl.createBufferInfoFromArrays(gl, {
      a_pos: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] }
    });
    // The fullscreen quad is a triangle strip.
    this.quad.indices = undefined;
  }

  render(input: EscherZoomInput): void {
    const gl = this.gl;
    const canvas = this.canvas;
    const prog = this.programInfo;
    const quad = this.quad;
    if (this.contextLost || !gl || !canvas || !prog || !quad) return;

    const { pixels, ctx: droste, R0, W, H, scale, t } = input;

    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    this.uploadTextureIfChanged(pixels, droste.sampleScale);

    gl.viewport(0, 0, W, H);
    gl.useProgram(prog.program);
    twgl.setBuffersAndAttributes(gl, prog, quad);
    twgl.setUniforms(prog, {
      u_src: this.texture,
      u_canvas: [W, H],
      u_scale: scale,
      u_c: [droste.cx, droste.cy],
      u_logS: droste.logS,
      u_lnR0: Math.log(Math.max(R0, 1e-9)),
      u_rMax: droste.rMax,
      u_workingSize: [droste.W, droste.H],
      u_crop: [droste.cropX, droste.cropY],
      u_sampleScale: droste.sampleScale,
      u_texSize: [pixels.width, pixels.height],
      u_t: t,
      u_shape: droste.shape === 'ellipse' ? 1 : 0
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
    this.canvas?.removeEventListener?.(
      'webglcontextlost',
      this.handleContextLost as EventListener
    );
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
    // ImageData is row-0-on-top (y-down). Our shader's working coords are
    // also y-down (we flip canvas y in the FS). Don't flip on upload — the
    // two would cancel and leave the picture upside down.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      pixels.width,
      pixels.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels.data
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.maxAniso > 1) {
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) {
        gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
      }
    }
    this.texture = tex;
    this.texPixels = pixels;
    this.texSampleScale = sampleScale;
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.opts.onContextLost?.();
  };
}
