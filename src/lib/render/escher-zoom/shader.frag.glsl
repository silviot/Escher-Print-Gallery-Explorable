#version 300 es
precision highp float;

/**
 * Escher spiral-zoom fragment shader.
 *
 * Per pixel:
 *   1. Map canvas pixel → working-image coord, then to (lnR, Phi) around c.
 *   2. Apply the Lenstra forward map with R₀ orientation correction.
 *   3. Animate by shifting source lnR by t·logS  (= multiplying r by S^t).
 *   4. Droste-fold the source point inward by integer multiples of S until
 *      it lands inside [0, W-1) × [0, H-1) of the working rectangle.
 *   5. Translate to original-image coords (+cropX, +cropY, ×sampleScale)
 *      and sample the source texture.
 *
 * Black where the limit point itself or where the fold can't bring the
 * point inside in 11 steps.
 */

uniform sampler2D u_src;
uniform vec2  u_canvas;       // canvas size (W, H) in pixels
uniform float u_scale;        // canvas-px per working-px
uniform vec2  u_c;            // limit point in working coords
uniform float u_logS;
uniform float u_lnR0;
uniform float u_rMax;
uniform vec2  u_workingSize;  // (W, H) of the working rect
uniform vec2  u_crop;         // crop offset (cropX, cropY)
uniform float u_sampleScale;  // 1 for raw source, > 1 for HQ
uniform vec2  u_texSize;      // texture pixel dims (after sampleScale)
uniform float u_t;            // animation phase
uniform float u_shapeMorph;   // fold domain: 0 = inscribed ellipse … 1 = working rect

out vec4 fragColor;

void main() {
  // gl_FragCoord.y = 0 is bottom-left in WebGL. Our coord system is y-down
  // (origin top-left, like the source image), so flip y when interpreting.
  vec2 px = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
  vec2 work = px / u_scale;
  vec2 d = work - u_c;
  float R2 = dot(d, d);
  if (R2 < 1e-12) { fragColor = vec4(0.0); return; }

  float k     = u_logS / 6.283185307179586;  // 2π
  float lnR   = 0.5 * log(R2);
  float Phi   = atan(d.y, d.x);
  float bLnR  = lnR + k * Phi;
  float nPhi  = Phi - k * (lnR - u_lnR0);
  float r     = exp(bLnR + u_t * u_logS);
  vec2  src   = u_c + r * vec2(cos(nPhi), sin(nPhi));

  // Droste fold: scale (src - c) by exp(n·logS) inward until in range.
  vec2  sd = src - u_c;
  float r2 = length(sd);
  if (r2 < 1e-12) { fragColor = vec4(0.0); return; }
  float n0 = floor((log(u_rMax) - log(r2)) / u_logS);

  vec4 col = vec4(0.0);
  // Fold domain = gauge ball inscribed in the working rect, blending the L2
  // (ellipse) and L∞ (rect) gauges by u_shapeMorph. First hit (scanning n
  // large→small) lands in the fundamental annulus at every morph value.
  // See sampleDroste in math/transforms.ts and ui1/shape.ts.
  vec2 eRad = (u_workingSize - 1.0) * 0.5;
  // 11 iterations matches the JS sampleDroste cap. GLSL ES 3.00 allows
  // dynamic break; Mesa, ANGLE, and Apple all handle this fine.
  for (int dn = 0; dn <= 10; dn++) {
    float n = n0 - float(dn);
    float s = exp(n * u_logS);
    vec2  tcoord = u_c + sd * s;
    vec2  e = abs(tcoord - eRad) / eRad;
    float gauge = mix(length(e), max(e.x, e.y), u_shapeMorph);
    if (gauge <= 1.0) {
      // Source-pixels-per-output-pixel = |α|·exp(k·Φ + n·logS) / canvasScale.
      // Sampling with `texture()` here would let the GPU pick mipmap LOD
      // from neighbouring fragments' uv gradients, but neighbours often
      // take different fold branches, so those gradients are garbage and
      // we get black-pixel artifacts at the fold boundaries. Compute LOD
      // analytically and use textureLod — well-defined inside the loop.
      float footprint =
        sqrt(1.0 + k * k) * exp(k * Phi + n * u_logS) / u_scale;
      float lod = max(0.0, log2(footprint));
      vec2 uv = (tcoord + u_crop) * u_sampleScale / u_texSize;
      col = textureLod(u_src, uv, lod);
      break;
    }
  }
  fragColor = col;
}
