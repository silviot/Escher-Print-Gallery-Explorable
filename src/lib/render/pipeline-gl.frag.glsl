#version 300 es
precision highp float;

/**
 * Fragment shader for the 4-panel pipeline explorable. One shader, three
 * modes (selected by u_mode); they differ only in how the output pixel maps
 * to a source point `src` in working coords. The Droste-fold + mipmap sample
 * tail is shared.
 *
 *   mode 0  log(z − c)      : fill the cell with the (logS, 2π) lattice.
 *   mode 1  rotated log      : same lattice rotated by β = atan(logS/2π).
 *   mode 2  tententoon still : (z − c)^α, α = 1 − i·logS/2π, at t = 0.
 *   mode 3  unroll           : morph spiral (u_morph=1) ↔ rotated-log strip
 *                              (u_morph=0). The "take the log" intuition made
 *                              visible: the spiral is the strip rolled up.
 *
 * log / rotlog map the WHOLE canvas (no letterbox): log space is doubly
 * periodic, so every pixel folds to a valid source ring — the panel tiles
 * infinitely with no black margins. escher maps working coords through the
 * Lenstra spiral exactly like the live renderer (shader.frag.glsl) at t = 0.
 */

uniform sampler2D u_src;
uniform vec2  u_canvas;       // canvas size (W, H) in pixels
uniform int   u_mode;         // 0 = log, 1 = rotlog, 2 = escher
uniform vec2  u_c;            // limit point in working coords
uniform float u_logS;
uniform float u_rMax;
uniform vec2  u_workingSize;  // (W, H) of the working rect (crop)
uniform vec2  u_crop;         // crop offset (cropX, cropY)
uniform float u_sampleScale;  // 1 for raw source, > 1 for HQ
uniform vec2  u_texSize;      // texture pixel dims (after sampleScale)

// log / rotlog params
uniform float u_pxPerUnit;    // canvas px per log-space unit (equal both axes)
uniform float u_uRef;         // log-radius anchored at the canvas centre

// escher params
uniform float u_scale;        // canvas-px per working-px
uniform float u_lnR0;         // log of the orientation radius R0

// experiment params (defaults keep canonical behaviour)
uniform float u_rot;          // rotated-log rotation angle (canonical: atan(logS/2π))
uniform float u_kTwist;       // tententoon twist k (canonical: logS/2π = tan(u_rot))
uniform vec2  u_pan;          // log-space pan (δu, δv) applied to all panels
uniform float u_morph;        // unroll: 1 = spiral, 0 = rotated-log strip

out vec4 fragColor;

const float TWO_PI = 6.283185307179586;

void main() {
  // y-down pixel coords (origin top-left, like the source image).
  vec2 pxd = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);

  vec2 src;
  float footA; // footprint = footA · exp(n·logS); set per mode.

  if (u_mode == 2) {
    // --- tententoon still --- twist k and a log-space pan (zoom δu, rotate δv).
    float k = u_kTwist;
    vec2 work = pxd / u_scale;
    vec2 d = work - u_c;
    float R2 = dot(d, d);
    if (R2 < 1e-12) { fragColor = vec4(0.0); return; }
    float lnR = 0.5 * log(R2);
    float Phi = atan(d.y, d.x);
    float bLnR = lnR + k * Phi + u_pan.x;
    float nPhi = Phi - k * (lnR - u_lnR0) + u_pan.y;
    float r = exp(bLnR);
    src = u_c + r * vec2(cos(nPhi), sin(nPhi));
    footA = sqrt(1.0 + k * k) * exp(k * Phi + u_pan.x) / u_scale;
  } else if (u_mode == 3) {
    // --- unroll --- one continuous deformation between the rolled-up spiral
    // (m = 1) and the flat rotated-log strip (m = 0). We express BOTH ends in
    // source log-polar coords (u = log-radius, v = angle) and mix there, so
    // each endpoint is exact and the in-between reads as the strip curling up.
    float k = u_kTwist;
    float m = u_morph;
    float cu = (pxd.x - u_canvas.x * 0.5) / u_pxPerUnit;
    float cv = (pxd.y - u_canvas.y * 0.5) / u_pxPerUnit;

    // Strip end: the rotated-log lattice (un-rotate the centred pixel by −β).
    float cosB = cos(u_rot);
    float sinB = sin(u_rot);
    float uStrip = cu * cosB + cv * sinB + u_uRef;
    float vStrip = -cu * sinB + cv * cosB;

    // Spiral end: read the centred pixel as a point in the plane, take its
    // screen log-polar (radius, angle), then apply the same twist the
    // tententoon uses. A small radius floor leaves a clean central hole
    // (the very spot Escher left blank) instead of a −∞ singularity.
    float rho = max(length(vec2(cu, cv)), 0.06);
    float phi = atan(cv, cu);
    float Lr = log(rho);
    float uSpiral = Lr + k * phi + u_uRef;
    float vSpiral = phi - k * (Lr - u_lnR0);

    float u = mix(uStrip, uSpiral, m) + u_pan.x;
    float v = mix(vStrip, vSpiral, m) + u_pan.y;
    u = u_uRef - mod(u_uRef - u, u_logS);
    float r = exp(u);
    src = u_c + r * vec2(cos(v), sin(v));
    footA = r / u_pxPerUnit;
  } else {
    // --- log / rotated log: fill the cell, centred anchor ---
    float cu = (pxd.x - u_canvas.x * 0.5) / u_pxPerUnit;
    float cv = (pxd.y - u_canvas.y * 0.5) / u_pxPerUnit;
    float u, v;
    if (u_mode == 1) {
      // Un-rotate by −u_rot: (u, v) = R(−rot)·(u', v').
      float cosB = cos(u_rot);
      float sinB = sin(u_rot);
      u = cu * cosB + cv * sinB + u_uRef + u_pan.x;
      v = -cu * sinB + cv * cosB + u_pan.y;
    } else {
      u = cu + u_uRef + u_pan.x;
      v = cv + u_pan.y;
    }
    // Wrap u into the outermost Droste ring (uRef − logS, uRef]. Log space
    // repeats with period logS, so this samples identical content (Droste
    // self-similarity) but always from the sharp outer ring — no dependence
    // on how many fold steps small logS would otherwise need, hence no
    // black at the edges and a sharper image.
    u = u_uRef - mod(u_uRef - u, u_logS);
    float r = exp(u);
    src = u_c + r * vec2(cos(v), sin(v));
    footA = r / u_pxPerUnit;
  }

  // --- shared Droste fold + mipmap sample ---
  vec2 sd = src - u_c;
  float r2 = length(sd);
  if (r2 < 1e-12) { fragColor = vec4(0.0); return; }
  float n0 = floor((log(u_rMax) - log(r2)) / u_logS);

  vec4 col = vec4(0.0);
  for (int dn = 0; dn <= 10; dn++) {
    float n = n0 - float(dn);
    float s = exp(n * u_logS);
    vec2 tcoord = u_c + sd * s;
    if (tcoord.x >= 0.0 && tcoord.y >= 0.0 &&
        tcoord.x <= u_workingSize.x - 1.0 &&
        tcoord.y <= u_workingSize.y - 1.0) {
      float footprint = footA * s;
      float lod = max(0.0, log2(footprint));
      vec2 uv = (tcoord + u_crop) * u_sampleScale / u_texSize;
      col = textureLod(u_src, uv, lod);
      break;
    }
  }
  fragColor = col;
}
