#version 300 es
precision highp float;

/**
 * Complex-playground uber fragment shader. One full-screen quad; one branch
 * per preset (u_mode), matching the `mode` order in presets.ts. The output
 * canvas is letter-boxed to the source-image aspect, so normalized output
 * coords equal normalized image coords at zoom 1 (identity = passthrough).
 *
 * For each output pixel at complex coord z (origin at image centre, +im up):
 *   domain pan:  w = f(z + c)
 *   output pan:  w = f(z) + c
 * then sample the source at w. Wrap (tile / clamp / mirror) is set on the
 * sampler by the renderer. f'(z) drives the mip LOD for footprint AA.
 */

uniform sampler2D u_src;
uniform vec2  u_canvas;     // output size (px)
uniform int   u_mode;
uniform float u_imgAspect;  // source W/H
uniform float u_zoom;       // 1 = whole image fits
uniform vec2  u_c;          // pan constant
uniform int   u_panMode;    // 0 = domain f(z+c), 1 = output f(z)+c
uniform vec4  u_pr;         // real scalar params
uniform vec2  u_pa;         // complex params
uniform vec2  u_pb;
uniform vec2  u_pc;
uniform vec2  u_texSize;    // source px

out vec4 fragColor;

const float PI = 3.141592653589793;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b) + 1e-30; return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
vec2 cexp(vec2 z) { float e = exp(z.x); return e * vec2(cos(z.y), sin(z.y)); }
vec2 clog(vec2 z) { return vec2(0.5 * log(dot(z, z) + 1e-30), atan(z.y, z.x)); }
vec2 cpow(vec2 z, vec2 w) { if (dot(z, z) < 1e-20) return vec2(0.0); return cexp(cmul(w, clog(z))); }
vec2 csinz(vec2 z) { return vec2(sin(z.x) * cosh(z.y), cos(z.x) * sinh(z.y)); }
vec2 ccosz(vec2 z) { return vec2(cos(z.x) * cosh(z.y), -sin(z.x) * sinh(z.y)); }
vec2 ctanz(vec2 z) { return cdiv(csinz(z), ccosz(z)); }

const vec2 ONE = vec2(1.0, 0.0);

// Evaluate f and f' for the active mode at point z. Returns f in `fOut`,
// derivative magnitude (for AA) in `dOut`.
void evalF(vec2 z, out vec2 fOut, out float dOut) {
  vec2 f; vec2 d;
  if (u_mode == 0) {            // identity
    f = z; d = ONE;
  } else if (u_mode == 1) {     // square
    f = cmul(z, z); d = 2.0 * z;
  } else if (u_mode == 2) {     // power zⁿ
    float n = u_pr.x;
    f = cpow(z, vec2(n, 0.0));
    d = cmul(vec2(n, 0.0), cpow(z, vec2(n - 1.0, 0.0)));
  } else if (u_mode == 3) {     // 1/z
    f = cdiv(ONE, z); d = cdiv(vec2(-1.0, 0.0), cmul(z, z));
  } else if (u_mode == 4) {     // Möbius k(z−z0)/(z−zi)
    vec2 den = z - u_pc;
    f = cmul(u_pa, cdiv(z - u_pb, den));
    d = cmul(u_pa, cdiv(u_pb - u_pc, cmul(den, den)));
  } else if (u_mode == 5) {     // Joukowski ½(z + 1/z)
    f = 0.5 * (z + cdiv(ONE, z));
    d = 0.5 * (ONE - cdiv(ONE, cmul(z, z)));
  } else if (u_mode == 6) {     // exp
    f = cexp(z); d = cexp(z);
  } else if (u_mode == 7) {     // log
    f = clog(z); d = cdiv(ONE, z);
  } else if (u_mode == 8) {     // Escher zᵃ, a = 1 − ik
    vec2 a = vec2(1.0, -u_pr.x);
    f = cpow(z, a);
    d = cmul(a, cpow(z, a - ONE));
  } else if (u_mode == 9) {     // sine
    f = csinz(z); d = ccosz(z);
  } else if (u_mode == 10) {    // tan
    f = ctanz(z);
    d = cdiv(ONE, cmul(ccosz(z), ccosz(z)));
  } else if (u_mode == 11) {    // sin(1/z)
    vec2 inv = cdiv(ONE, z);
    f = csinz(inv);
    d = cmul(ccosz(inv), cdiv(vec2(-1.0, 0.0), cmul(z, z)));
  } else {
    f = z; d = ONE;
  }
  fOut = f;
  dOut = length(d);
}

void main() {
  vec2 nz = gl_FragCoord.xy / u_canvas;            // [0,1], y up
  vec2 half2 = vec2(max(u_imgAspect, 1.0), max(1.0 / u_imgAspect, 1.0));
  vec2 z = (2.0 * nz - 1.0) * half2 / u_zoom;      // complex, origin centre

  vec2 zin = (u_panMode == 0) ? z + u_c : z;

  vec2 w; float dmag;
  evalF(zin, w, dmag);
  if (u_panMode == 1) w += u_c;

  // source uv (v flipped: +im up → top row v = 0)
  vec2 uv = vec2(0.5 + 0.5 * w.x / half2.x, 0.5 - 0.5 * w.y / half2.y);

  // footprint AA: texels covered per output pixel ≈ |f'| · texW / (zoom · canvasW)
  float footprint = dmag * u_texSize.x / max(u_zoom * u_canvas.x, 1.0);
  float lod = max(0.0, log2(max(footprint, 1e-6)));

  fragColor = textureLod(u_src, uv, lod);
}
