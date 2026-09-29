// Draws the film's text (see domain/effects/typeset.ts): each text laid out letter by letter in its
// font, every style layer drawn for all its letters in turn (so a glow sits behind all the fills),
// each letter moved, turned, scaled, faded and blurred as its animation says. Fire burns off the
// letters' shape on the GPU, and lightning and aura run on it (see textParticles.ts), as they do off
// a tracked object. Where each text was drawn is kept, so a tap can find it.
import { fxOf } from '@/domain/effects/body';
import { PALETTES, type FxSettings } from '@/domain/effects/palettes';
import type { Params } from '@/domain/effects/params';
import type { FontId } from '@/domain/effects/text';
import type { DrawnText } from '@/domain/effects/typeset';
import type { Pose } from '@/domain/effects/letters';
import { FireShader } from './fireShader';
import { fontFor, type Fonts } from './fonts';
import { applyPose } from './pose';
import { TextParticles } from './textParticles';

// what the particle effects need beyond a pass's own settings (colors, size, strength)
const BASE_FX: FxSettings = {
  effect: 'lightning',
  pal: 0,
  size: 1,
  intensity: 1,
  volume: 0,
  outline: 'neon',
  glitch: 'chaos',
  text: '',
  textStyle: 'behind',
  font: 'anton',
  water: 'rain',
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// the widest a text is drawn, of the frame's width, before it's made smaller to fit
const FIT = 0.92;

// where a text was drawn: its middle, size and turn (frame px)
export interface TextBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

interface Laid {
  px: number; // letter height
  xs: number[]; // each letter's middle, from the text's middle
  w: number;
}

export class TextClipPainter {
  private layer = new OffscreenCanvas(1, 1);
  private mask = new OffscreenCanvas(1, 1);
  private fire: FireShader | null = null;
  private noFire = false;
  private particles = new TextParticles();
  private boxes: TextBox[] = [];

  // draws the texts over ctx's canvas (W x H), the last on top; outline: a dashed box round the
  // selected one
  draw(
    ctx: Ctx,
    texts: readonly DrawnText[],
    fonts: Fonts,
    opts: { selected?: number | null; outline?: boolean } = {},
  ) {
    const { width: W, height: H } = ctx.canvas;
    this.boxes = [];
    this.particles.keepOnly(new Set(texts.flatMap(t => t.styles.map((_, k) => `${t.id}:${k}`))));
    for (const t of texts) {
      const laid = this.layout(ctx, t, fonts, W);
      if (!laid) continue;
      const box = {
        id: t.id,
        x: t.place.x * W,
        y: t.place.y * H,
        w: laid.w + laid.px * 0.4,
        h: laid.px * 1.3,
        rot: (t.place.rot * Math.PI) / 180,
      };
      this.drawText(ctx, t, laid, fonts, box, W, H);
      // (where it's found and outlined: where its animation has moved it)
      const p = t.pose;
      const moved = {
        ...box,
        x: box.x + p.x * W,
        y: box.y + p.y * H,
        w: box.w * p.scale,
        h: box.h * p.scale,
        rot: box.rot + p.rot,
      };
      this.boxes.push(moved);
      if (opts.outline && opts.selected === t.id) outlineBox(ctx, moved);
    }
  }

  // the top text drawn at (x, y) last time, if any
  hit(x: number, y: number): number | null {
    for (let k = this.boxes.length - 1; k >= 0; k--) {
      const b = this.boxes[k];
      const dx = x - b.x,
        dy = y - b.y,
        c = Math.cos(-b.rot),
        s = Math.sin(-b.rot);
      if (Math.abs(dx * c - dy * s) < b.w / 2 && Math.abs(dx * s + dy * c) < b.h / 2) return b.id;
    }
    return null;
  }

  // each letter's place along the line, shrunk to fit the frame
  private layout(ctx: Ctx, t: DrawnText, fonts: Fonts, W: number): Laid | null {
    if (!t.letters.length) return null;
    let px = t.size * W * t.place.scale;
    const measure = (px: number) => {
      ctx.font = fontFor(fonts, t.font as FontId, px);
      const ws = t.letters.map(l => ctx.measureText(l).width),
        gap = t.spacing * px;
      return { ws, total: ws.reduce((a, b) => a + b, 0) + gap * (t.letters.length - 1), gap };
    };
    let m = measure(px);
    if (m.total > W * FIT * t.place.scale && m.total > 0) {
      px *= (W * FIT * t.place.scale) / m.total;
      m = measure(px);
    }
    const xs: number[] = [];
    let x = -m.total / 2;
    m.ws.forEach(w => {
      xs.push(x + w / 2);
      x += w + m.gap;
    });
    return { px, xs, w: m.total };
  }

  private drawText(ctx: Ctx, t: DrawnText, laid: Laid, fonts: Fonts, box: TextBox, W: number, H: number) {
    const g = this.surface(this.layer, W, H);
    g.clearRect(0, 0, W, H);
    g.font = fontFor(fonts, t.font as FontId, laid.px);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // what's drawn so far put onto the frame, moved as the clip's animation says
    const put = (img: OffscreenCanvas, mode: GlobalCompositeOperation = 'source-over') => {
      ctx.save();
      ctx.globalCompositeOperation = mode;
      applyPose(ctx, t.pose, box.x, box.y, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      ctx.restore();
    };
    // the letters' shape, for fire, lightning and aura (made once, when one's wanted)
    let mask: OffscreenCanvas | null = null;
    const shape = () => (mask ??= this.letterMask(t, laid, fonts, box, W, H));
    t.styles.forEach((s, k) => {
      // (fire is added onto the frame itself, which has to have what's under it already: its
      // canvas is black where there are no flames)
      if (s.kind === 'fire') {
        put(this.layer);
        g.clearRect(0, 0, W, H);
        const fire = this.drawFire(shape(), t, laid, s.values);
        if (fire) put(fire, 'lighter');
      } else if (s.kind === 'lightning' || s.kind === 'aura') {
        // (added onto the frame too, like the particle effects on objects)
        put(this.layer);
        g.clearRect(0, 0, W, H);
        const fx = fxOf(s.kind, s.values, BASE_FX);
        this.particles.draw(g, shape(), fx, t.t, W, H, `${t.id}:${k}`, t.id * 31 + k);
        put(this.layer, 'lighter');
        g.clearRect(0, 0, W, H);
      } else
        this.eachLetter(g, t, laid, box, (pose, letter) => style(g, s.kind, s.values, letter, laid.px, pose));
    });
    put(this.layer);
  }

  // runs draw for each visible letter, with the canvas moved to it
  private eachLetter(
    g: Ctx,
    t: DrawnText,
    laid: Laid,
    box: TextBox,
    draw: (pose: Pose, letter: string) => void,
  ) {
    t.letters.forEach((letter, i) => {
      const pose = t.poses[i];
      if (pose.alpha <= 0.002 || !letter.trim()) return;
      g.save();
      g.translate(box.x, box.y);
      g.rotate(box.rot);
      g.translate(laid.xs[i] + pose.dx * laid.px, pose.dy * laid.px);
      g.rotate(pose.rot);
      g.scale(pose.scale, pose.scale);
      g.globalAlpha = Math.min(1, pose.alpha);
      if (pose.blur > 0.005) g.filter = `blur(${(pose.blur * laid.px).toFixed(1)}px)`;
      draw(pose, letter);
      g.restore();
    });
  }

  // the letters' shape, white, at half the frame's size (as they're drawn, before the clip's animation)
  private letterMask(t: DrawnText, laid: Laid, fonts: Fonts, box: TextBox, W: number, H: number) {
    const fw = Math.max(1, Math.round(W / 2)),
      fh = Math.max(1, Math.round(H / 2));
    const m = this.surface(this.mask, fw, fh);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, fw, fh);
    m.scale(fw / W, fh / H);
    m.font = fontFor(fonts, t.font as FontId, laid.px);
    m.textAlign = 'center';
    m.textBaseline = 'middle';
    m.fillStyle = '#fff';
    this.eachLetter(m, t, laid, box, (_, letter) => m.fillText(letter, 0, 0));
    m.setTransform(1, 0, 0, 1, 0, 0);
    return this.mask;
  }

  // flames rising off the letters' shape (half the frame's size, to be added onto it; null without
  // WebGL2)
  private drawFire(mask: OffscreenCanvas, t: DrawnText, laid: Laid, v: Params) {
    const { width: fw, height: fh } = mask;
    if (!this.fire && !this.noFire) {
      this.fire = FireShader.create(fw, fh);
      this.noFire = !this.fire;
    }
    if (!this.fire) return null;
    if (this.fire.canvas.width !== fw || this.fire.canvas.height !== fh) this.fire.resize(fw, fh);
    const pal = Math.max(
      0,
      PALETTES.findIndex(p => p.name.toLowerCase() === v.palette),
    );
    const unit = (laid.px / 2) * 0.12;
    return this.fire.render(mask, t.t, unit, (v.height as number) * laid.px * 1.2, v.amount as number, pal);
  }

  private surface(c: OffscreenCanvas, w: number, h: number) {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    // (the letters' shape is read back, for lightning and aura)
    return c.getContext('2d', { willReadFrequently: c === this.mask }) as OffscreenCanvasRenderingContext2D;
  }
}

// one style layer of one letter, drawn at the origin
function style(g: Ctx, kind: string, v: Params, letter: string, px: number, pose: Pose) {
  const a = v.amount as number;
  g.globalAlpha *= Math.min(1, a);
  switch (kind) {
    case 'fill': {
      const k = v.gradient as number;
      if (k > 0) {
        const grad = g.createLinearGradient(0, -px / 2, 0, px / 2);
        grad.addColorStop(0, v.color as string);
        grad.addColorStop(Math.max(0.01, 1 - k * 0.6), v.color as string);
        grad.addColorStop(1, v.color2 as string);
        g.fillStyle = grad;
      } else g.fillStyle = v.color as string;
      g.fillText(letter, 0, 0);
      return;
    }
    case 'stroke': {
      const w = (v.width as number) * px * 0.16;
      if (w <= 0) return;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.strokeStyle = v.color as string;
      g.strokeText(letter, 0, 0);
      return;
    }
    case 'glow': {
      // (drawn twice: once is too faint)
      g.shadowColor = v.color as string;
      g.shadowBlur = (v.size as number) * px * 0.9 * pose.scale;
      g.fillStyle = v.color as string;
      g.fillText(letter, 0, 0);
      g.fillText(letter, 0, 0);
      return;
    }
    case 'shadow': {
      const blur = (v.blur as number) * px * 0.3;
      if (blur > 0.5) g.filter = `${g.filter === 'none' ? '' : g.filter} blur(${blur.toFixed(1)}px)`.trim();
      g.fillStyle = v.color as string;
      g.fillText(letter, (v.x as number) * px * 0.2, (v.y as number) * px * 0.2);
      return;
    }
  }
}

function outlineBox(ctx: Ctx, b: TextBox) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}
