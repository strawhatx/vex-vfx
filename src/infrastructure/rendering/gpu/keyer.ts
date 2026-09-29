// Keys a green screen out of a picture on the GPU: a pixel's see-through by how close its color is
// to green (compared by hue and strength, not brightness, so shadows on the green go too), with a
// soft edge, and green light spilled onto what's kept pulled back. The result has see-through
// pixels, to draw over the frame.
import { FULL_FRAME_VERT, compile, fullFrame, newTexture } from './gl';

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uTol;
out vec4 outColor;
vec2 chroma(vec3 c) { return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float d = distance(chroma(c), chroma(vec3(0.1, 0.8, 0.2)));
  float edge = mix(0.05, 0.35, uTol);
  float a = smoothstep(edge, edge + 0.08, d);
  // (green spill on what's kept: its green held down to the other channels)
  c.g = mix(min(c.g, max(c.r, c.b)), c.g, a * a);
  outColor = vec4(c * a, a);
}`;

export class Keyer {
  private canvas = new OffscreenCanvas(1, 1);
  private gl: WebGL2RenderingContext | null = null;
  private failed = false;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;

  // the picture (w x h) with its green keyed out; null if it can't be done here (no WebGL2). The
  // canvas returned is reused by the next call.
  render(picture: TexImageSource, w: number, h: number, tolerance: number) {
    const gl = this.context();
    if (!gl || !this.prog || w < 1 || h < 1) return null;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uSrc'), 0);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uTol'), tolerance);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  private context() {
    if (this.gl || this.failed) return this.gl;
    try {
      const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error('no WebGL2');
      fullFrame(gl);
      this.prog = compile(gl, FULL_FRAME_VERT, FRAG);
      this.tex = newTexture(gl);
      this.gl = gl;
    } catch {
      this.failed = true;
    }
    return this.gl;
  }
}
