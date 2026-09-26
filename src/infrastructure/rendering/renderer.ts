// Draws one output frame: the video frame, then each tracked object's effect for that frame,
// and (in the editor) their outlines. Effects are rebuilt from track data, so any frame can be
// rendered in any order and comes out the same; sequential playback just steps each simulation
// forward. Simulations never run across a cut, so effects start fresh in every shot.
import type { EffectLayers, LayerSpec } from '@/application/ports';
import { EffectSim, MAX_LIFE, type FxFrame } from '@/infrastructure/rendering/sim';
import type { Ctx2D } from '@/infrastructure/rendering/sprites';
import { FireShader } from '@/infrastructure/rendering/fireShader';
import { frameIndexAt, type TrackFrame } from '@/domain/tracking/types';
import { FrameGeometry } from './geometry';

export interface RenderOptions { outline: boolean; paused: boolean; selected: number | null }

class Layer {
  sim: EffectSim;
  simIdx = -1;
  dirty = true;
  constructor(public spec: LayerSpec, public geo: FrameGeometry) { this.sim = new EffectSim(spec.id); }
  invalidate() { this.geo.clear(); this.dirty = true; }
}

export class Renderer implements EffectLayers {
  readonly ctx: Ctx2D;
  CW = 0; CH = 0;
  private W = 0; private H = 0;
  private clip: TrackFrame[] = [];
  private shot: Int32Array = new Int32Array(0);
  private layers = new Map<number, Layer>();
  private glowCanvas: OffscreenCanvas | null = null;
  private gctx: OffscreenCanvasRenderingContext2D | null = null;
  // GPU fire at half the output size, fed from a heat-source canvas of the same size
  private fire: FireShader | null = null;
  private fireFailed = false;
  private fireSrc: OffscreenCanvas | null = null;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.ctx = canvas.getContext('2d') as Ctx2D;
  }

  // output is the video scaled to maxWidth; W x H is the analysis size the track data uses
  setup(videoW: number, videoH: number, W: number, H: number, maxWidth = 960) {
    const k = Math.min(1, maxWidth / videoW);
    this.CW = Math.round(videoW * k); this.CH = Math.round(videoH * k);
    this.W = W; this.H = H;
    this.canvas.width = this.CW; this.canvas.height = this.CH;
    this.glowCanvas = new OffscreenCanvas(this.CW, this.CH);
    this.gctx = this.glowCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const fw = Math.max(1, Math.round(this.CW / 2)), fh = Math.max(1, Math.round(this.CH / 2));
    this.fireSrc = new OffscreenCanvas(fw, fh);
    this.fire?.resize(fw, fh);
    for (const l of this.layers.values()) l.geo = this.newGeo();
    this.invalidate();
  }

  // every frame of the clip, and for each frame the index of the first frame of its shot
  setClip(frames: TrackFrame[], shot: Int32Array) { this.clip = frames; this.shot = shot; this.invalidate(); }

  // adds, updates or removes layers to match; unchanged track data keeps its simulation
  setLayers(specs: LayerSpec[]) {
    const keep = new Set(specs.map(s => s.id));
    for (const id of this.layers.keys()) if (!keep.has(id)) this.layers.delete(id);
    for (const s of specs) {
      const l = this.layers.get(s.id);
      if (!l) { this.layers.set(s.id, new Layer(s, this.newGeo())); continue; }
      if (l.spec.frames !== s.frames) l.invalidate();
      if (l.spec.settings !== s.settings) l.dirty = true;
      l.spec = s;
    }
  }
  // a layer's track data changed in place
  changed(id: number) { this.layers.get(id)?.invalidate(); }
  invalidate() { for (const l of this.layers.values()) l.invalidate(); }

  // renders the frame shown at time t; returns its index in the clip, or -1 if not scanned
  render(source: CanvasImageSource, t: number, opts: RenderOptions) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0, this.CW, this.CH);
    const idx = this.CW ? frameIndexAt(this.clip, t) : -1;
    if (idx < 0) return -1;
    for (const l of this.layers.values()) {
      if (l.spec.frames.length !== this.clip.length) continue;
      this.advanceTo(l, idx);
      const f = this.fxFrame(l, idx);
      l.geo.prepareCanvas(l.spec.frames[idx]);
      l.sim.draw(ctx, f, l.spec.settings, {
        maskGlow: (c, col, blur, alpha) => this.maskGlow(l, c, col, blur, alpha),
        fire: (c, fr, u, intensity) => this.drawFire(l, c, fr, u, intensity),
      });
    }
    if (opts.outline) for (const l of this.layers.values()) {
      if (l.spec.frames.length === this.clip.length) this.drawOutline(l, idx, opts.paused, opts.selected);
    }
    return idx;
  }

  private newGeo() { return new FrameGeometry(this.W || 1, this.H || 1, this.CW / (this.W || 1)); }

  private advanceTo(l: Layer, idx: number) {
    const frames = l.spec.frames, shot = this.shot, s0 = shot[idx] ?? 0;
    const canContinue = !l.dirty && l.simIdx >= 0 && idx >= l.simIdx && shot[l.simIdx] === s0 && frames[idx].t - frames[l.simIdx].t <= MAX_LIFE;
    let j = l.simIdx + 1;
    if (!canContinue) {
      // no particle outlives MAX_LIFE, so simulating from that far back (or the shot's start) rebuilds the state exactly
      l.sim.reset();
      j = idx;
      while (j > s0 && frames[j - 1].t >= frames[idx].t - MAX_LIFE) j--;
    }
    for (; j <= idx; j++) l.sim.step(this.fxFrame(l, j), l.spec.settings);
    l.simIdx = idx; l.dirty = false;
  }

  private fxFrame(l: Layer, i: number): FxFrame {
    const frames = l.spec.frames, geo = l.geo, f = frames[i], prev = frames[i - 1];
    const sameShot = prev && this.shot[i - 1] === this.shot[i];
    const dt = Math.max(0.001, Math.min(0.1, sameShot && f.t - prev.t < 0.2 ? f.t - prev.t : f.dur || 1 / 30));
    const o = geo.outline(frames, i);
    return { index: i, t: f.t, dt, tgt: geo.target(frames, i, dt, this.shot), contour: o.contour, n: o.n, hasShape: o.hasShape };
  }

  private drawFire(l: Layer, ctx: Ctx2D, f: FxFrame, u: number, intensity: number) {
    const src = this.fireSrc!, fw = src.width, fh = src.height;
    if (!this.fire && !this.fireFailed) { this.fire = FireShader.create(fw, fh); this.fireFailed = !this.fire; }
    if (!this.fire) return false;
    // heat source: the silhouette, or an ellipse around the target when there's only a box
    const g = src.getContext('2d') as OffscreenCanvasRenderingContext2D, k = fw / this.CW, t = f.tgt;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fw, fh);
    if (f.hasShape) g.drawImage(l.geo.maskCanvas, 0, 0, fw, fh);
    else { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(t.x * k, t.y * k, t.rx * k, t.ry * k, 0, 0, Math.PI * 2); g.fill(); }
    const out = this.fire.render(src, f.t, u * k, u * k * 9, Math.min(1.6, intensity), l.spec.settings.pal);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true; ctx.drawImage(out, 0, 0, this.CW, this.CH);
    ctx.restore();
    return true;
  }

  // soft glow hugging the layer's silhouette; cut keeps the inside clear
  private maskGlow(l: Layer, ctx: Ctx2D, col: string, blur: number, alpha: number, cut = true) {
    const g = this.gctx!, mcan = l.geo.maskCanvas, { CW, CH } = this, OFF = CW + 64;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, CW, CH);
    g.save(); g.shadowColor = col; g.shadowBlur = blur; g.shadowOffsetX = OFF;
    g.drawImage(mcan, -OFF, 0, CW, CH); g.restore();
    if (cut) { g.globalCompositeOperation = 'destination-out'; g.drawImage(mcan, 0, 0, CW, CH); g.globalCompositeOperation = 'source-over'; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.drawImage(this.glowCanvas!, 0, 0); ctx.restore();
  }
  private maskTint(l: Layer, ctx: Ctx2D, col: string, alpha: number) {
    const g = this.gctx!, { CW, CH } = this;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, CW, CH); g.drawImage(l.geo.maskCanvas, 0, 0, CW, CH);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(this.glowCanvas!, 0, 0); ctx.restore();
  }

  // each object's outline in its own color; the selected one is tinted while paused
  private drawOutline(l: Layer, idx: number, paused: boolean, selected: number | null) {
    const ctx = this.ctx, frames = l.spec.frames;
    if (!frames[idx].shapes.length) return;
    const o = l.geo.outline(frames, idx), sel = selected === l.spec.id, col = o.lost ? '#ff4d4d' : l.spec.color;
    if (o.hasShape) {
      if (paused && sel) this.maskTint(l, ctx, l.spec.color, 0.25);
      this.maskGlow(l, ctx, col, sel ? 4 : 2, sel ? 1 : 0.7);
    } else {
      const t = l.geo.target(frames, idx, 1 / 30, this.shot);
      if (!t.active) return;
      ctx.save(); ctx.lineWidth = sel ? 2.5 : 1.5; ctx.strokeStyle = col;
      ctx.setLineDash(o.lost ? [6, 5] : [10, 6]);
      ctx.strokeRect(t.x - t.rx, t.y - t.ry, t.rx * 2, t.ry * 2);
      ctx.restore();
    }
  }
}
