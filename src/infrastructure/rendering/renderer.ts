// Draws one output frame: the video frame, then each clip for that frame, (in the editor) their
// outlines, and any impacts playing out. Everything is rebuilt from track data, so any frame can
// be rendered in any order and comes out the same. The drawing itself lives in the layer modules:
//   layer.ts        particle effects (fire, lightning, aura, sparks) and their simulation
//   laserLayer.ts   lasers
//   outlineFx.ts    the Outline effect
//   glitch.ts       the Glitch effect (after the others, so they glitch too)
//   text.ts         the Text effect (words behind the object first, labels and titles last)
//   water.ts        the Water effect: rain or underwater, over the other effects
//   impactLayer.ts  impacts and the camera jolt
//   strandLayer.ts  paths: whips, ropes, ribbons… simulated from their anchor, in their look
//   cutoutLayer.ts  cutouts: what's left where each was cut from, then the layers themselves
//   outline.ts      outlines and targets while editing
import type { CutFrame, EffectLayers, LayerSpec } from '@/application/ports';
import type { Cam } from '@/domain/effects/laser';
import { frameIndexAt, type TrackFrame } from '@/domain/tracking/types';
import { GpuFire } from './fire';
import { FrameGeometry } from './geometry';
import { CutoutStore, drawCutout, drawCutoutFrame, drawCutoutHole } from './cutoutLayer';
import { drawImpacts } from './impactLayer';
import { drawLaser } from './laserLayer';
import { Layer } from './layer';
import { MaskPainter } from './masks';
import { drawOutline, drawSceneSpot } from './outline';
import { drawOutlineFx } from './outlineFx';
import { GlitchPainter } from './glitch';
import { FALLBACK_FONTS, type Fonts } from './fonts';
import { StrandPainter } from './strandLayer';
import { TextPainter } from './text';
import { WaterPainter } from './water';
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
  private cutouts = new CutoutStore();
  private masks = new MaskPainter(1, 1);
  private fire = new GpuFire();
  private glitch = new GlitchPainter(1, 1);
  private text = new TextPainter(1, 1);
  private water = new WaterPainter(1, 1);
  private strands = new StrandPainter(1, 1);
  // counts changes to anything a path's motion depends on, so it's worked out again
  private epoch = 0;
  private fonts: Fonts = FALLBACK_FONTS;
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
    this.glitch = new GlitchPainter(this.CW, this.CH);
    this.text = new TextPainter(this.CW, this.CH);
    this.water = new WaterPainter(this.CW, this.CH);
    this.strands = new StrandPainter(this.CW, this.CH);
    this.fire.resize(this.CW, this.CH);
    this.jolt = new OffscreenCanvas(this.CW, this.CH);
    for (const l of this.layers.values()) l.geo = this.newGeo();
    this.invalidate();
  }

  // ---------- EffectLayers ----------

  setClip(frames: TrackFrame[], shot: Int32Array) {
    if (frames.length !== this.clip.length) this.cutouts.clear(); // a new clip
    this.clip = frames;
    this.shot = shot;
    this.invalidate();
  }

  // adds, updates or removes layers to match
  setLayers(specs: LayerSpec[]) {
    this.epoch++;
    const keep = new Set(specs.map(s => s.id));
    for (const id of this.layers.keys()) if (!keep.has(id)) this.layers.delete(id);
    this.cutouts.keepOnly(new Set(specs.filter(s => s.kind === 'cutout').map(s => s.id)));
    for (const s of specs) {
      const l = this.layers.get(s.id);
      if (l) l.update(s);
      else this.layers.set(s.id, new Layer(s, this.newGeo()));
    }
  }

  // the fonts text is drawn in, once they're loaded
  setFonts(fonts: Fonts) {
    this.fonts = fonts;
  }

  setCamera(path: (Cam | null)[]) {
    this.cam = path;
  }

  changed(id: number) {
    this.epoch++;
    this.layers.get(id)?.invalidate();
  }

  cutoutFrames(id: number, frames: CutFrame[]) {
    this.cutouts.put(id, frames);
  }

  trimCutout(id: number, span: { s: number; e: number }) {
    this.cutouts.trim(id, span);
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
    const all = [...this.layers.values()];
    const cutouts = all.filter(l => l.spec.kind === 'cutout' && l.spec.frames.length === this.clip.length);
    // effects and impacts on at this frame (a cutout shows where it's placed: see below)
    const showing = all.filter(l => l.spec.kind !== 'cutout' && l.isOn(frameT, this.clip.length));

    // the footage: what's left where objects were cut out, then the cutouts where they're placed
    for (const l of cutouts) {
      const reveal = opts.paused && opts.selected === l.spec.id;
      drawCutoutHole(v, this.cutouts, l, idx, reveal);
    }
    const placed = cutouts.map(l => ({ l, at: drawCutout(v, this.cutouts, l, idx) }));

    const isText = (l: Layer) => l.spec.kind === 'effect' && l.spec.settings.effect === 'text';
    // words behind the object go under every other effect
    for (const l of showing)
      if (isText(l) && l.spec.settings.textStyle === 'behind') this.text.draw(v, l, idx);

    // paths are worked out again when the track data or the camera's path changes
    const strandKey = `${this.epoch}:${this.cam.reduce((n, c) => n + (c ? 1 : 0), 0)}`;
    for (const l of showing) {
      if (l.spec.kind === 'impact') continue; // just its burst, drawn below
      if (isText(l) || l.spec.settings.effect === 'water') continue;
      if (l.spec.settings.effect === 'glitch') continue; // below, over everything else
      if (l.spec.settings.effect === 'path')
        this.strands.draw(v, l, idx, this.layers, strandKey, { masks: this.masks, fire: this.fire });
      else if (l.spec.settings.effect === 'laser') drawLaser(v, l, idx);
      else if (l.spec.settings.effect === 'outline') this.drawOutlineFx(l, idx);
      else this.drawParticles(l, idx);
    }

    for (const l of showing) {
      if (l.spec.kind === 'effect' && l.spec.settings.effect === 'glitch') this.drawGlitch(l, idx);
    }
    for (const l of showing) {
      if (l.spec.kind === 'effect' && l.spec.settings.effect === 'water') this.drawWater(l, idx);
    }
    // labels and titles on top
    for (const l of showing)
      if (isText(l) && l.spec.settings.textStyle !== 'behind') this.text.draw(v, l, idx);

    if (opts.outline) {
      for (const l of showing) drawOutline(v, this.masks, l, idx, opts.selected === l.spec.id, opts.paused);
      for (const { l, at } of placed) {
        const selected = opts.selected === l.spec.id;
        // the selected cutout's object where it's cut from, to fix its outline
        if (selected && l.isOn(frameT, this.clip.length))
          drawOutline(v, this.masks, l, idx, true, opts.paused);
        // and where it's placed; others still being cut out show where they'll be
        if (at && (selected || !at.ready)) drawCutoutFrame(v, l, at, selected);
      }
      // the selected clip's spot in the scene, even outside its range, to show where it will be
      const sel = opts.selected !== null && this.layers.get(opts.selected);
      if (sel && opts.paused) drawSceneSpot(v, sel, idx);
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

  private drawOutlineFx(l: Layer, idx: number) {
    const f = l.fxFrame(idx, this.shot);
    l.geo.prepareCanvas(l.spec.frames[idx]);
    drawOutlineFx(this.ctx, this.masks, l.geo.maskCanvas, f, l.spec.settings, l.spec.id);
  }

  // rain or underwater, over the whole frame (from a spot) or round the object
  private drawWater(l: Layer, idx: number) {
    const t = this.clip[idx].t;
    const tgt = l.spec.pinned ? null : l.fxFrame(idx, this.shot).tgt;
    const box = tgt?.active ? tgt : null;
    this.water.draw(this.ctx, this.canvas, box, l.spec.settings, t, l.spec.id);
  }

  // a glitch over the whole frame (from a spot), or on the object
  private drawGlitch(l: Layer, idx: number) {
    const t = this.clip[idx].t;
    if (l.spec.pinned) {
      this.glitch.draw(this.ctx, this.canvas, null, l.spec.settings, t, l.spec.id);
      return;
    }
    const f = l.fxFrame(idx, this.shot);
    if (!f.tgt.active) return;
    l.geo.prepareCanvas(l.spec.frames[idx]);
    const area = { mask: f.hasShape ? l.geo.maskCanvas : null, box: f.tgt };
    this.glitch.draw(this.ctx, this.canvas, area, l.spec.settings, t, l.spec.id);
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
      fonts: this.fonts,
    };
  }

  private newGeo() {
    return new FrameGeometry(this.W || 1, this.H || 1, this.CW / (this.W || 1));
  }

  private invalidate() {
    this.epoch++;
    for (const l of this.layers.values()) l.invalidate();
  }
}
