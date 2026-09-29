// Draws the film's looks (filters and screen effects: see domain/project/looks.ts) over a finished
// frame on the GPU. The frame is uploaded once, each pass runs as one shader into the next of two
// textures in turn, and the last draws straight to the canvas, which is copied back over the frame.
// One WebGL context does it all (browsers allow only a few), and it's resized for thumbnails.
import { buildLut, type Grade } from '@/domain/effects/color';
import type { DrawnPass } from '@/domain/effects/passes';
import { isColor, rgbOf } from '@/domain/effects/params';
import { SCREEN_KINDS, type ScreenKind } from '@/domain/effects/screen';
import { FULL_FRAME_VERT, compile, dropTarget, fullFrame, newTarget, newTexture, type Target } from './gl';
import { GRADE, SCREEN } from './shaders';

const LUT_SIZE = 33;
// LUTs kept for the grades drawn lately (a slider on a grade setting makes a new one each step)
const LUT_CACHE = 24;

interface Program {
  prog: WebGLProgram;
  u: Map<string, WebGLUniformLocation | null>;
}

export class LookPainter {
  private canvas = new OffscreenCanvas(1, 1);
  private gl: WebGL2RenderingContext | null = null;
  private failed = false;
  private programs = new Map<string, Program>();
  private src: WebGLTexture | null = null;
  private targets: Target[] = [];
  private luts = new Map<string, WebGLTexture>();
  private W = 0;
  private H = 0;

  // draws the passes over what's on ctx's canvas (w x h), in place; false if they can't be drawn
  // here (no WebGL2), leaving the frame as it was
  apply(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, passes: readonly DrawnPass[]) {
    if (!passes.length) return true;
    const { width: w, height: h } = ctx.canvas;
    const out = this.render(ctx.canvas, w, h, passes);
    if (!out) return false;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(out, 0, 0, w, h);
    ctx.restore();
    return true;
  }

  // the picture with the passes drawn over it, w x h; null if they can't be drawn here. The canvas
  // returned is reused by the next call.
  render(picture: CanvasImageSource, w: number, h: number, passes: readonly DrawnPass[]) {
    const gl = this.context();
    if (!gl || w < 1 || h < 1) return null;
    this.size(gl, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture as TexImageSource);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let input = this.src!;
    // (nothing to draw: the picture as it is)
    const list: readonly (DrawnPass | null)[] = passes.length ? passes : [null];
    list.forEach((p, k) => {
      const last = k === list.length - 1,
        to = last ? null : this.targets[k % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null);
      gl.viewport(0, 0, w, h);
      this.draw(gl, p, input);
      if (to) input = to.tex;
    });
    return this.canvas;
  }

  private context() {
    if (this.gl || this.failed) return this.gl;
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error('no WebGL2');
      fullFrame(gl);
      this.src = newTexture(gl);
      this.gl = gl;
    } catch {
      this.failed = true;
    }
    return this.gl;
  }

  private size(gl: WebGL2RenderingContext, w: number, h: number) {
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of this.targets) dropTarget(gl, t);
    this.targets = [newTarget(gl, w, h), newTarget(gl, w, h)];
  }

  private program(gl: WebGL2RenderingContext, key: string, frag: string): Program {
    let p = this.programs.get(key);
    if (!p) {
      p = { prog: compile(gl, FULL_FRAME_VERT, frag), u: new Map() };
      this.programs.set(key, p);
    }
    gl.useProgram(p.prog);
    return p;
  }

  private uniform(gl: WebGL2RenderingContext, p: Program, name: string) {
    if (!p.u.has(name)) p.u.set(name, gl.getUniformLocation(p.prog, name));
    return p.u.get(name)!;
  }

  // one pass (null: the input as it is), reading `input`
  private draw(gl: WebGL2RenderingContext, pass: DrawnPass | null, input: WebGLTexture) {
    const mips = pass?.engine === 'screen' && !!SCREEN[pass.kind].mips;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);

    let p: Program;
    if (!pass || pass.engine === 'color') {
      p = this.program(gl, 'grade', GRADE);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, pass ? this.lut(gl, pass.grade) : null);
      gl.uniform1i(this.uniform(gl, p, 'uLut'), 1);
      gl.uniform1f(this.uniform(gl, p, 'uLutSize'), LUT_SIZE);
      gl.uniform1f(this.uniform(gl, p, 'u_amount'), pass ? pass.amount : 0);
    } else {
      p = this.program(gl, pass.kind, SCREEN[pass.kind].frag);
      this.setValues(gl, p, pass.kind, pass.values);
    }
    gl.uniform1i(this.uniform(gl, p, 'uSrc'), 0);
    gl.uniform2f(this.uniform(gl, p, 'uRes'), this.W, this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // each value as uniform u_<key>: numbers as floats, colors as vec3, choices as the index picked
  private setValues(
    gl: WebGL2RenderingContext,
    p: Program,
    kind: ScreenKind,
    values: Record<string, number | string>,
  ) {
    const specs = SCREEN_KINDS[kind].params;
    for (const [key, v] of Object.entries(values)) {
      const loc = this.uniform(gl, p, `u_${key}`);
      if (!loc) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (isColor(v)) gl.uniform3fv(loc, rgbOf(v));
      else {
        const spec = specs.find(s => s.key === key);
        gl.uniform1f(
          loc,
          spec?.type === 'choice'
            ? Math.max(
                0,
                spec.options.findIndex(o => o.id === v),
              )
            : 0,
        );
      }
    }
  }

  // the grade's LUT as a 3D texture, made once and kept while it's in use
  private lut(gl: WebGL2RenderingContext, grade: Grade) {
    const key = JSON.stringify(grade);
    let t = this.luts.get(key);
    if (t) {
      // (most recently used last)
      this.luts.delete(key);
      this.luts.set(key, t);
      return t;
    }
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
      gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      LUT_SIZE,
      LUT_SIZE,
      LUT_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buildLut(grade, LUT_SIZE),
    );
    this.luts.set(key, t);
    if (this.luts.size > LUT_CACHE) {
      const [oldest, tex] = this.luts.entries().next().value!;
      gl.deleteTexture(tex);
      this.luts.delete(oldest);
    }
    return t;
  }
}
