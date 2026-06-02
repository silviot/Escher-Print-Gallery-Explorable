/**
 * WebGL2 renderer for the complex playground. One full-screen quad + the
 * uber fragment shader (shader.frag.glsl), one branch per preset. Mirrors
 * PipelinePanelGLRenderer: texture cached by identity, main-thread only
 * (each frame is a handful of complex ops per pixel — trivially 60fps).
 *
 * Fill mode maps straight to the sampler wrap: tile → REPEAT, mirror →
 * MIRRORED_REPEAT, clamp → CLAMP_TO_EDGE, so out-of-image samples never
 * show black.
 */

import * as twgl from 'twgl.js';
import vertSrc from '../escher-zoom/shader.vert.glsl?raw';
import fragSrc from './shader.frag.glsl?raw';
import type { FillMode, PresetUniforms } from './presets';

export type PlaygroundGLInput = {
  pixels: ImageData;
  mode: number;
  /** Canvas pixel dims. */
  W: number;
  H: number;
  imgAspect: number;
  zoom: number;
  c: [number, number];
  /** 0 = domain f(z+c), 1 = output f(z)+c. */
  panMode: number;
  uniforms: PresetUniforms;
  fill: FillMode;
};

export class PlaygroundGLRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private programInfo: twgl.ProgramInfo | null = null;
  private quad: twgl.BufferInfo | null = null;
  private texture: WebGLTexture | null = null;
  private texPixels: ImageData | null = null;
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

  render(input: PlaygroundGLInput): void {
    const gl = this.gl;
    const canvas = this.canvas;
    const prog = this.programInfo;
    const quad = this.quad;
    if (!gl || !canvas || !prog || !quad) return;

    const { pixels, W, H } = input;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    this.uploadTextureIfChanged(pixels);
    this.applyWrap(input.fill);

    gl.viewport(0, 0, W, H);
    gl.useProgram(prog.program);
    twgl.setBuffersAndAttributes(gl, prog, quad);
    twgl.setUniforms(prog, {
      u_src: this.texture,
      u_canvas: [W, H],
      u_mode: input.mode,
      u_imgAspect: input.imgAspect,
      u_zoom: input.zoom,
      u_c: input.c,
      u_panMode: input.panMode,
      u_pr: input.uniforms.pr,
      u_pa: input.uniforms.pa,
      u_pb: input.uniforms.pb,
      u_pc: input.uniforms.pc,
      u_texSize: [pixels.width, pixels.height]
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
  }

  private applyWrap(fill: FillMode): void {
    const gl = this.gl!;
    if (!this.texture) return;
    const wrap =
      fill === 'tile' ? gl.REPEAT : fill === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  private uploadTextureIfChanged(pixels: ImageData): void {
    const gl = this.gl!;
    if (pixels === this.texPixels && this.texture) return;

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
    if (this.maxAniso > 1) {
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
    }
    this.texture = tex;
    this.texPixels = pixels;
  }
}
