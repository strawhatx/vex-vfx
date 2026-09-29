// The fragment shader for each kind of pass (see domain/effects/passes.ts). Each reads the picture
// so far from uSrc and its settings as uniforms named u_<setting> (colors as vec3, choices as the
// index of the one picked); uv's y runs up, so a setting's "down" is 1 - y.
import type { ScreenKind } from '@/domain/effects/screen';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 outColor;
const float PI = 3.14159265;
vec3 src(vec2 uv) { return texture(uSrc, uv).rgb; }
vec2 at(float x, float y) { return vec2(x, 1.0 - y); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// soft blur round uv, radius r px: taps on a golden-angle spiral, from a smaller mip level the wider it is
vec3 blurred(vec2 uv, float r) {
  float lod = max(0.0, log2(r / 5.0));
  vec3 s = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float f = (float(i) + 0.5) / 24.0, a = float(i) * 2.39996;
    s += textureLod(uSrc, uv + vec2(cos(a), sin(a)) * sqrt(f) * r / uRes, lod).rgb;
  }
  return s / 24.0;
}
`;

const shader = (uniforms: string, body: string) => `${HEAD}${uniforms}\nvoid main() {\n${body}\n}`;

// the color engine: the grade looked up in its LUT, mixed in by amount
export const GRADE = shader(
  `uniform highp sampler3D uLut;
uniform float uLutSize, u_amount;`,
  `  vec3 c = src(vUv);
  vec3 g = texture(uLut, c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize).rgb;
  outColor = vec4(mix(c, g, u_amount), 1.0);`,
);

// the screen engine. mips: it reads blurred mip levels of the picture
export const SCREEN: Record<ScreenKind, { frag: string; mips?: boolean }> = {
  blur: {
    mips: true,
    frag: shader(
      `uniform float u_amount;`,
      `  outColor = vec4(blurred(vUv, u_amount * 0.04 * uRes.x), 1.0);`,
    ),
  },
  zoomBlur: {
    frag: shader(
      `uniform float u_amount, u_x, u_y;`,
      `  vec2 c = at(u_x, u_y);
  vec3 s = vec3(0.0);
  for (int i = 0; i < 20; i++) s += src(c + (vUv - c) * (1.0 - u_amount * 0.3 * float(i) / 19.0));
  outColor = vec4(s / 20.0, 1.0);`,
    ),
  },
  shake: {
    frag: shader(
      `uniform float u_amount, u_dx, u_dy, u_rot;`,
      `  // moved and turned, zoomed in a little so the edges never show
  float k = 1.0 + abs(u_amount) * 0.12;
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p = mat2(cos(u_rot), sin(u_rot), -sin(u_rot), cos(u_rot)) * p / k;
  vec2 uv = p / vec2(uRes.x / uRes.y, 1.0) + 0.5 + vec2(u_dx, -u_dy);
  outColor = vec4(src(uv), 1.0);`,
    ),
  },
  zoom: {
    frag: shader(
      `uniform float u_amount, u_x, u_y;`,
      `  vec2 c = at(u_x, u_y);
  vec2 uv = c + (vUv - c) / max(0.05, 1.0 + u_amount);
  bool out_ = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)));
  outColor = vec4(out_ ? vec3(0.0) : src(uv), 1.0);`,
    ),
  },
  flash: {
    frag: shader(
      `uniform float u_amount;
uniform vec3 u_color;`,
      `  outColor = vec4(mix(src(vUv), u_color, clamp(u_amount, 0.0, 1.0)), 1.0);`,
    ),
  },
  vignette: {
    frag: shader(
      `uniform float u_amount, u_size;
uniform vec3 u_color;`,
      `  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
  float inner = mix(0.15, 0.85, u_size);
  float v = smoothstep(inner, inner + 0.55, r);
  outColor = vec4(mix(src(vUv), u_color, v * u_amount), 1.0);`,
    ),
  },
  rgbSplit: {
    frag: shader(
      `uniform float u_amount, u_angle;`,
      `  float a = radians(u_angle);
  vec2 d = vec2(cos(a), sin(a)) * u_amount * 0.025 * vec2(uRes.y / uRes.x, 1.0);
  outColor = vec4(src(vUv + d).r, src(vUv).g, src(vUv - d).b, 1.0);`,
    ),
  },
  glow: {
    mips: true,
    frag: shader(
      `uniform float u_amount, u_threshold, u_size;`,
      `  vec3 c = src(vUv);
  float r = mix(0.01, 0.08, u_size) * uRes.x;
  float lod = max(0.0, log2(r / 5.0));
  // the bright parts (a soft knee above the threshold), spread out, screened over the picture
  vec3 s = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float f = (float(i) + 0.5) / 24.0, a = float(i) * 2.39996;
    vec3 t = textureLod(uSrc, vUv + vec2(cos(a), sin(a)) * sqrt(f) * r / uRes, lod).rgb;
    float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
    s += t * smoothstep(u_threshold, min(1.0, u_threshold + 0.35), l);
  }
  vec3 glow = s / 24.0 * u_amount * 0.9;
  outColor = vec4(1.0 - (1.0 - c) * (1.0 - glow), 1.0);`,
    ),
  },
  pixelate: {
    frag: shader(
      `uniform float u_amount;`,
      `  float b = mix(1.0, 0.08 * uRes.x, u_amount * u_amount);
  vec2 uv = (floor(vUv * uRes / b) + 0.5) * b / uRes;
  outColor = vec4(src(uv), 1.0);`,
    ),
  },
  mirror: {
    frag: shader(
      `uniform float u_amount, u_mode;`,
      `  vec2 uv = vUv;
  int m = int(u_mode + 0.5);
  if (m == 0 || m == 4) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;  // left half, or four ways
  if (m == 1) uv.x = uv.x < 0.5 ? 1.0 - uv.x : uv.x;             // right half
  if (m == 2 || m == 4) uv.y = uv.y < 0.5 ? 1.0 - uv.y : uv.y;  // top half (y runs up)
  if (m == 3) uv.y = uv.y > 0.5 ? 1.0 - uv.y : uv.y;             // bottom half
  outColor = vec4(mix(src(vUv), src(uv), u_amount), 1.0);`,
    ),
  },
  grain: {
    frag: shader(
      `uniform float u_amount, u_size, u_frame;`,
      `  float cell = mix(1.0, 4.0, u_size);
  float n = hash(floor(vUv * uRes / cell) + vec2(u_frame * 17.0, u_frame * 31.0)) - 0.5;
  outColor = vec4(src(vUv) + n * u_amount * 0.35, 1.0);`,
    ),
  },
  scanlines: {
    frag: shader(
      `uniform float u_amount, u_density;`,
      `  float lines = mix(80.0, 420.0, u_density);
  float s = 0.5 + 0.5 * sin(vUv.y * lines * 2.0 * PI);
  outColor = vec4(src(vUv) * (1.0 - u_amount * 0.55 * (1.0 - s)), 1.0);`,
    ),
  },
  leak: {
    frag: shader(
      `uniform float u_amount, u_x, u_y, u_size;
uniform vec3 u_color;`,
      `  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float d = length((vUv - at(u_x, u_y)) * asp);
  float r = mix(0.2, 1.2, u_size);
  float g = exp(-d * d / (r * r * 0.35)) * u_amount;
  vec3 c = src(vUv);
  outColor = vec4(1.0 - (1.0 - c) * (1.0 - u_color * g), 1.0); // (screen blend)`,
    ),
  },
  invert: {
    frag: shader(
      `uniform float u_amount;`,
      `  vec3 c = src(vUv);
  outColor = vec4(mix(c, 1.0 - c, u_amount), 1.0);`,
    ),
  },
  wave: {
    frag: shader(
      `uniform float u_amount, u_freq, u_speed, u_time;`,
      `  float f = mix(4.0, 60.0, u_freq), w = u_time * mix(0.5, 12.0, u_speed);
  vec2 uv = vUv + vec2(sin(vUv.y * f + w), cos(vUv.x * f * 0.7 + w * 1.3)) * u_amount * 0.02;
  outColor = vec4(src(uv), 1.0);`,
    ),
  },
  split: {
    frag: shader(
      `uniform float u_amount, u_count;`,
      `  // 2 and 3 stack, 4 and 9 make a grid; each screen shows the middle of the frame, uncropped in its shape
  int n = int(u_count + 0.5);
  vec2 grid = n == 0 ? vec2(1.0, 2.0) : n == 1 ? vec2(1.0, 3.0) : n == 2 ? vec2(2.0, 2.0) : vec2(3.0, 3.0);
  vec2 local = fract(vUv * grid);
  float k = grid.y / grid.x;
  vec2 region = k >= 1.0 ? vec2(1.0, 1.0 / k) : vec2(k, 1.0);
  vec2 uv = 0.5 + (local - 0.5) * region;
  outColor = vec4(mix(src(vUv), src(uv), u_amount), 1.0);`,
    ),
  },
  warp: {
    frag: shader(
      `uniform float u_amount, u_x, u_y;`,
      `  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = at(u_x, u_y);
  vec2 p = (vUv - c) * asp;
  float r = length(p), R = 0.75;
  float k = r < R ? 1.0 - u_amount * 0.5 * (1.0 - r / R) * (1.0 - r / R) : 1.0;
  outColor = vec4(src(c + p * k / asp), 1.0);`,
    ),
  },
};
