// Procedural fire drawn on the GPU. Flames rise off the tracked silhouette: every pixel looks
// down through the "source" (the object's mask) for heat, bent sideways by animated noise, then
// the heat is broken into tongues with more noise and mapped through the palette's color ramp.
// Driven only by the mask and the frame time, so any frame renders the same every time.
import { PALETTES } from '@/domain/effects/palettes';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uRes;       // layer size in px
uniform float uTime, uUnit, uHeight, uIntensity;
uniform vec3 uC0, uC1, uC2, uC3; // hottest to coolest
out vec4 outColor;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s + 0.5;
}
// the silhouette, plus a blurred copy so flames also lick out from the sides
float source(vec2 uv) {
  return max(texture(uSrc, uv).a, textureLod(uSrc, uv, 3.0).a * 0.9);
}
vec3 ramp(float f) {
  if (f < 0.25) return mix(vec3(0.0), uC3, f / 0.25);
  if (f < 0.5) return mix(uC3, uC2, (f - 0.25) / 0.25);
  if (f < 0.78) return mix(uC2, uC1, (f - 0.5) / 0.28);
  return mix(uC1, uC0, min(1.0, (f - 0.78) / 0.22));
}

void main() {
  vec2 px = vUv * uRes;
  vec2 P = px / (uUnit * 5.0);
  float t = uTime;
  // large slow turbulence bends the whole plume
  vec2 warp = vec2(fbm(P * 0.8 + vec2(0.0, t * 1.4)), fbm(P * 0.8 + vec2(5.2, t * 1.4 + 1.3))) - 0.5;
  float heat = 0.0;
  for (int i = 0; i < 24; i++) {
    float d = (float(i) + 0.5) / 24.0;
    vec2 q = px + vec2(warp.x * 1.6 * d * uHeight, d * uHeight * (1.0 + warp.y * 0.6));
    heat = max(heat, source(q / uRes) * (1.0 - d));
  }
  // fine, fast turbulence tears the heat into tongues; the tips break up first
  float n = fbm(P * 2.2 + warp * 2.0 + vec2(0.0, t * 3.2));
  float f = heat * (0.45 + n * 1.1) - 0.18;
  f = clamp(f * 1.35, 0.0, 1.0);
  // keep the subject itself visible: fire wraps around it rather than covering it
  f *= 1.0 - smoothstep(0.3, 0.9, texture(uSrc, vUv).a) * 0.96;
  float flick = 0.9 + 0.1 * sin(t * 17.0 + n * 6.0);
  vec3 col = ramp(f) * smoothstep(0.02, 0.3, f) * uIntensity * flick;
  outColor = vec4(col, 1.0);
}`;

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class FireShader {
  readonly canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};

  // returns null when WebGL2 isn't available; callers fall back to particle flames
  static create(w: number, h: number) {
    try {
      const canvas = new OffscreenCanvas(w, h);
      const gl = canvas.getContext('webgl2', {
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        antialias: false,
      });
      return gl ? new FireShader(canvas, gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(canvas: OffscreenCanvas, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.prog = p;
    gl.useProgram(p);
    for (const k of ['uSrc', 'uRes', 'uTime', 'uUnit', 'uHeight', 'uIntensity', 'uC0', 'uC1', 'uC2', 'uC3'])
      this.u[k] = gl.getUniformLocation(p, k);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uSrc, 0);
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // src: the heat source (white where the object is), same aspect as the layer.
  // unit and height are in layer pixels.
  render(src: OffscreenCanvas, t: number, unit: number, height: number, intensity: number, pal: number) {
    const gl = this.gl,
      { width, height: h } = this.canvas,
      c = PALETTES[pal].c;
    gl.viewport(0, 0, width, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(this.u.uRes, width, h);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uUnit, unit);
    gl.uniform1f(this.u.uHeight, height);
    gl.uniform1f(this.u.uIntensity, intensity);
    gl.uniform3fv(this.u.uC0, hex(c[0]));
    gl.uniform3fv(this.u.uC1, hex(c[1]));
    gl.uniform3fv(this.u.uC2, hex(c[2]));
    gl.uniform3fv(this.u.uC3, hex(c[3]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
