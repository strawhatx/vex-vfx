// Draws one output frame: the video frame, the effect for that frame, and (in the editor)
// the outline overlay. Effects are rebuilt from track data, so any frame can be rendered in
// any order and comes out the same; sequential playback just steps the simulation forward.
import { PALETTES, type FxSettings } from '@/effects/palettes';
import { EffectSim, MAX_LIFE, type FxFrame } from '@/effects/sim';
import type { Ctx2D } from '@/effects/sprites';
import { frameIndexAt, type TrackFrame } from '@/tracking/types';
import { FrameGeometry, type Selection } from './geometry';

export interface RenderOptions { outline: boolean; paused: boolean }

export class Renderer {
  readonly ctx: Ctx2D;
  CW = 0; CH = 0;
  private frames: TrackFrame[] = [];
  private sel: Selection = null;
  private settings: FxSettings;
  private sim = new EffectSim(1);
  private simIdx = -1;
  private dirty = true;
  private geo: FrameGeometry | null = null;
  private glowCanvas: OffscreenCanvas | null = null;
  private gctx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas, settings: FxSettings) {
    this.ctx = canvas.getContext('2d') as Ctx2D;
    this.settings = settings;
  }

  // output is the video scaled to maxWidth; W x H is the analysis size the track data uses
  setup(videoW: number, videoH: number, W: number, H: number, maxWidth = 960) {
    const k = Math.min(1, maxWidth / videoW);
    this.CW = Math.round(videoW * k); this.CH = Math.round(videoH * k);
    this.canvas.width = this.CW; this.canvas.height = this.CH;
    this.geo = new FrameGeometry(W, H, this.CW / W);
    this.glowCanvas = new OffscreenCanvas(this.CW, this.CH);
    this.gctx = this.glowCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.invalidate();
  }

  setFrames(frames: TrackFrame[]) { this.frames = frames; this.invalidate(); }
  // more frames arrived at the end; the last few smoothed positions can change
  framesAppended(prevLength: number) {
    this.geo?.forget(prevLength - 3);
    if (this.simIdx >= prevLength - 3) this.dirty = true;
  }
  setSelection(sel: Selection) { this.sel = sel; this.invalidate(); }
  setSettings(s: FxSettings) { this.settings = s; this.dirty = true; }
  invalidate() { this.geo?.clear(); this.dirty = true; }

  get trackFrames() { return this.frames; }

  // renders the frame shown at time t; returns its index in the track, or -1 if not analysed
  render(source: CanvasImageSource, t: number, opts: RenderOptions) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0, this.CW, this.CH);
    const idx = this.geo ? frameIndexAt(this.frames, t) : -1;
    if (idx < 0) return -1;
    this.advanceTo(idx);
    const f = this.fxFrame(idx), geo = this.geo!;
    geo.prepareCanvas(this.frames[idx], this.sel);
    this.sim.draw(ctx, f, this.settings, (c, col, blur, alpha) => this.maskGlow(c, col, blur, alpha));
    if (opts.outline) this.drawOutline(f, opts.paused);
    return idx;
  }

  private advanceTo(idx: number) {
    const frames = this.frames;
    const canContinue = !this.dirty && this.simIdx >= 0 && idx >= this.simIdx && frames[idx].t - frames[this.simIdx].t <= MAX_LIFE;
    let j = this.simIdx + 1;
    if (!canContinue) {
      // no particle outlives MAX_LIFE, so simulating from that far back rebuilds the state exactly
      this.sim.reset();
      j = idx;
      while (j > 0 && frames[j - 1].t >= frames[idx].t - MAX_LIFE) j--;
    }
    for (; j <= idx; j++) this.sim.step(this.fxFrame(j), this.settings);
    this.simIdx = idx; this.dirty = false;
  }

  private fxFrame(i: number): FxFrame {
    const frames = this.frames, geo = this.geo!, f = frames[i];
    const prev = frames[i - 1], dt = Math.max(0.001, Math.min(0.1, prev && f.t - prev.t < 0.2 ? f.t - prev.t : f.dur || 1 / 30));
    const o = geo.outline(frames, i, this.sel);
    return { index: i, t: f.t, dt, tgt: geo.target(frames, i, this.sel, dt), contour: o.contour, n: o.n, hasShape: o.hasShape };
  }

  // soft glow hugging the selected silhouettes; cut keeps the inside clear
  private maskGlow(ctx: Ctx2D, col: string, blur: number, alpha: number, cut = true) {
    const g = this.gctx!, mcan = this.geo!.maskCanvas, { CW, CH } = this, OFF = CW + 64;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, CW, CH);
    g.save(); g.shadowColor = col; g.shadowBlur = blur; g.shadowOffsetX = OFF;
    g.drawImage(mcan, -OFF, 0, CW, CH); g.restore();
    if (cut) { g.globalCompositeOperation = 'destination-out'; g.drawImage(mcan, 0, 0, CW, CH); g.globalCompositeOperation = 'source-over'; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.drawImage(this.glowCanvas!, 0, 0); ctx.restore();
  }
  private maskTint(ctx: Ctx2D, col: string, alpha: number) {
    const g = this.gctx!, { CW, CH } = this;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, CW, CH); g.drawImage(this.geo!.maskCanvas, 0, 0, CW, CH);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(this.glowCanvas!, 0, 0); ctx.restore();
  }

  private drawOutline(f: FxFrame, paused: boolean) {
    const ctx = this.ctx, lost = this.geo!.outline(this.frames, f.index, this.sel).lost;
    if (f.hasShape) {
      if (paused) this.maskTint(ctx, PALETTES[this.settings.pal].c[1], 0.22);
      this.maskGlow(ctx, lost ? '#ff4d4d' : '#ffffff', 3, 0.9);
    } else if (f.tgt.active) {
      const t = f.tgt;
      ctx.save(); ctx.lineWidth = 2;
      ctx.strokeStyle = lost ? '#ff4d4d' : 'rgba(255,255,255,.85)';
      ctx.setLineDash(lost ? [6, 5] : [10, 6]);
      ctx.strokeRect(t.x - t.rx, t.y - t.ry, t.rx * 2, t.ry * 2);
      ctx.restore();
    }
  }
}
