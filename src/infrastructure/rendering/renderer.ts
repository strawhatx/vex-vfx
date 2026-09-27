// Draws one output frame: the video frame, then each clip for that frame, (in the editor) their
// outlines, and any impacts playing out. Everything is rebuilt from track data, so any frame can
// be rendered in any order and comes out the same. The drawing itself lives in the layer modules:
//   layer.ts        particle effects (fire, lightning, aura, sparks) and their simulation
//   laserLayer.ts   lasers
//   impactLayer.ts  impacts and the camera jolt
//   outline.ts      outlines and targets while editing
import type { EffectLayers, LayerSpec } from '@/application/ports';
import type { Cam } from '@/domain/effects/laser';
import { frameIndexAt, type TrackFrame } from '@/domain/tracking/types';
import { GpuFire } from './fire';
import { FrameGeometry } from './geometry';
import { drawImpacts } from './impactLayer';
import { drawLaser } from './laserLayer';
import { Layer } from './layer';
import { MaskPainter } from './masks';
import { drawLaserTarget, drawOutline } from './outline';
import type { Ctx2D } from './sprites';
import type { View } from './view';

export interface RenderOptions {
  outline: boolean; // draw outlines (not in exports)
  paused: boolean;
  selected: number | null;
}

export class Renderer implements EffectLayers {
  readonly ctx: Ctx2D;
  CW = 0; // output size
  CH = 0;
  private W = 0; // analysis size, which the track data uses
  private H = 0;
  private clip: TrackFrame[] = [];
  private shot: Int32Array = new Int32Array(0);
  private cam: (Cam | null)[] = [];
  private layers = new Map<number, Layer>();
  private masks = new MaskPainter(1, 1);
  private fire = new GpuFire();
  // a copy of the frame, redrawn shaken and zoomed while an impact jolts the camera
  private jolt = new OffscreenCanvas(1, 1);

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.ctx = canvas.getContext('2d') as Ctx2D;
  }

  // output is the video scaled to maxWidth; W x H is the analysis size the track data uses
  setup(videoW: number, videoH: number, W: number, H: number, maxWidth = 960) {
    const k = Math.min(1, maxWidth / videoW);
    this.CW = Math.round(videoW * k);
    this.CH = Math.round(videoH * k);
    this.W = W;
    this.H = H;
    this.canvas.width = this.CW;
    this.canvas.height = this.CH;
    this.masks = new MaskPainter(this.CW, this.CH);
    this.fire.resize(this.CW, this.CH);
    this.jolt = new OffscreenCanvas(this.CW, this.CH);
    for (const l of this.layers.values()) l.geo = this.newGeo();
    this.invalidate();
  }

  // ---------- EffectLayers ----------

  setClip(frames: TrackFrame[], shot: Int32Array) {
    this.clip = frames;
    this.shot = shot;
    this.invalidate();
  }

  // adds, updates or removes layers to match
  setLayers(specs: LayerSpec[]) {
    const keep = new Set(specs.map(s => s.id));
    for (const id of this.layers.keys()) if (!keep.has(id)) this.layers.delete(id);
    for (const s of specs) {
      const l = this.layers.get(s.id);
      if (l) l.update(s);
      else this.layers.set(s.id, new Layer(s, this.newGeo()));
    }
  }

  setCamera(path: (Cam | null)[]) {
    this.cam = path;
  }

  changed(id: number) {
    this.layers.get(id)?.invalidate();
  }

  // ---------- drawing ----------

  // renders the frame shown at time t; returns its index in the clip, or -1 if not scanned
  render(source: CanvasImageSource, t: number, opts: RenderOptions) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(source, 0, 0, this.CW, this.CH);
    const idx = this.CW ? frameIndexAt(this.clip, t) : -1;
    if (idx < 0) return -1;

    const v = this.view();
    const frameT = this.clip[idx].t;
    const showing = [...this.layers.values()].filter(l => l.isOn(frameT, this.clip.length));

    for (const l of showing) {
      if (l.spec.kind === 'impact') continue; // just its burst, drawn below
      if (l.spec.settings.effect === 'laser') drawLaser(v, l, idx);
      else this.drawParticles(l, idx);
    }

    if (opts.outline) {
      for (const l of showing) {
        const selected = opts.selected === l.spec.id;
        drawOutline(v, this.masks, l, idx, selected, opts.paused);
        if (selected && opts.paused) drawLaserTarget(v, l, idx);
      }
    }

    drawImpacts(v, this.layers.values(), idx, this.canvas, this.jolt);
    return idx;
  }

  private drawParticles(l: Layer, idx: number) {
    l.advanceTo(idx, this.shot);
    const f = l.fxFrame(idx, this.shot);
    const mask = l.geo.maskCanvas;
    l.geo.prepareCanvas(l.spec.frames[idx]);
    l.sim.draw(this.ctx, f, l.spec.settings, {
      maskGlow: (c, col, blur, alpha) => this.masks.glow(mask, c, col, blur, alpha),
      fire: (c, fr, u, intensity) => this.fire.draw(c, mask, fr, u, intensity, l.spec.settings.pal),
    });
  }

  private view(): View {
    return {
      ctx: this.ctx,
      CW: this.CW,
      CH: this.CH,
      q: this.CW / (this.W || 1),
      clip: this.clip,
      shot: this.shot,
      cam: this.cam,
    };
  }

  private newGeo() {
    return new FrameGeometry(this.W || 1, this.H || 1, this.CW / (this.W || 1));
  }

  private invalidate() {
    for (const l of this.layers.values()) l.invalidate();
  }
}
