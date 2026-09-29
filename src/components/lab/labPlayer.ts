// The Preset Lab's controller and composition root (like the editor's player.ts): it plays a test
// clip round and round (or shows a test scene when none is loaded), with the preset being made
// drawn over it by the same GPU painter the editor uses, so what's made here looks the same there.
// The effect's own time loops over the preset's length and can be scrubbed; before/after shows the
// left half as it was. Body effects are drawn by the editor's own renderer on a clip made up for
// them (see bodyStage.ts).
import type { Preset } from '@/domain/effects/presets';
import { TRANSITION_HOLD, previewLength } from '@/domain/effects/draft';
import { transitionAt } from '@/domain/project/transitions';
import { looksAt, newLook, textsAt } from '@/domain/project/looks';
import { NO_ANIM, isAnimKind, poseAt, type ClipAnim } from '@/domain/effects/animation';
import { applyPose } from '@/infrastructure/rendering/pose';
import { FALLBACK_FONTS, type Fonts } from '@/infrastructure/rendering/fonts';
import { LookPainter } from '@/infrastructure/rendering/gpu/looks';
import { TextClipPainter } from '@/infrastructure/rendering/textClips';
import { Renderer } from '@/infrastructure/rendering/renderer';
import { workSize, type TrackFrame } from '@/domain/tracking/types';
import { loadFonts } from '../editor/fonts';
import { SCENE_H, SCENE_W, bodyLayer, drawPerson, subject, testFrames } from './bodyStage';

export interface LabState {
  t: number; // the effect's time
  playing: boolean;
  clip: string | null; // the test clip's name (null: the test scene)
  gpu: boolean; // false: WebGL2 isn't available here, so nothing can be drawn
}

// the preview is at most this big (px)
const MAX_W = 720,
  MAX_H = 900;
// the state is sent to the page this often while playing (ms)
const STATE_EVERY = 100;

export class LabPlayer {
  private ctx: CanvasRenderingContext2D;
  private painter = new LookPainter();
  private texts = new TextClipPainter();
  private fonts: Fonts = FALLBACK_FONTS;
  private scene = testScene(DAY);
  // what a transition cuts to
  private next = testScene(DUSK);
  private video: HTMLVideoElement | null = null;
  private url: string | null = null;
  private preset: Preset | null = null;
  private state: LabState = { t: 0, playing: true, clip: null, gpu: true };
  private compare = false;
  // body effects: the renderer, what it's set up for, and the made-up clip's frames and object
  private stage: Renderer | null = null;
  private stageFor = '';
  private stagePreset: Preset | null = null;
  private stageClip: { frames: TrackFrame[]; shape: ReturnType<typeof subject> } | null = null;
  private last = 0;
  private sent = 0;
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private onState: (s: LabState) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.raf = requestAnimationFrame(this.frame);
    void loadFonts().then(fonts => {
      this.fonts = fonts;
      this.draw();
    });
  }

  setPreset(p: Preset) {
    this.preset = p;
    this.state.t = Math.min(this.state.t, previewLength(p));
    if (!this.state.playing) this.draw();
  }

  loadFile(f: File) {
    this.dropVideo();
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    this.url = URL.createObjectURL(f);
    v.src = this.url;
    void v.play().catch(() => {});
    this.video = v;
    this.set({ clip: f.name });
  }

  // back to the test scene
  useScene() {
    this.dropVideo();
    this.set({ clip: null });
  }

  togglePlay() {
    const playing = !this.state.playing;
    if (playing) void this.video?.play().catch(() => {});
    else this.video?.pause();
    this.set({ playing });
  }

  seek(t: number) {
    this.set({ t: Math.max(0, Math.min(this.preset ? previewLength(this.preset) : 0, t)) });
    this.draw();
  }

  setCompare(on: boolean) {
    this.compare = on;
    this.draw();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.dropVideo();
  }

  private frame = (now: number) => {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.state.playing && this.preset) {
      this.state.t = (this.state.t + dt) % previewLength(this.preset);
      this.draw();
      if (now - this.sent > STATE_EVERY) {
        this.sent = now;
        this.onState({ ...this.state });
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw() {
    const v = this.video;
    const src: CanvasImageSource = v && v.readyState >= 2 ? v : this.scene;
    const sw = v && src === v ? v.videoWidth : this.scene.width,
      sh = v && src === v ? v.videoHeight : this.scene.height;
    if (!sw || !sh) return;
    const k = Math.min(1, MAX_W / sw, MAX_H / sh),
      W = Math.round(sw * k),
      H = Math.round(sh * k);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const ctx = this.ctx;
    const motion = this.preset?.group === 'motion' ? animOf(this.preset) : null;
    if (motion) {
      // (the picture moved as the animation says, over black)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      applyPose(ctx, poseAt(motion, this.state.t, this.preset!.length), W / 2, H / 2, W, H);
      ctx.drawImage(src, 0, 0, W, H);
      ctx.restore();
      return;
    }
    if (this.preset?.group === 'transition') {
      this.drawCut(src, this.preset, W, H);
      return;
    }
    if (this.preset?.group === 'body') {
      const r = this.bodyStage(sw, sh, src === this.scene, this.preset);
      r.render(src, this.state.t, { outline: false, paused: !this.state.playing, selected: null });
      ctx.drawImage(r.canvas, 0, 0, W, H);
      this.drawCompare(src, sw, sh, W, H);
      return;
    }
    ctx.drawImage(src, 0, 0, W, H);
    if (!this.preset) return;
    // (a clip of it as long as it is, its controls at their defaults; a text with its type's words)
    const clip = { ...newLook(1, this.preset, 0, this.preset.length), row: 0 };
    const gpu = this.painter.apply(ctx, looksAt([clip], this.state.t));
    if (gpu !== this.state.gpu) this.set({ gpu });
    this.texts.draw(ctx, textsAt([clip], this.state.t), this.fonts);
    this.drawCompare(src, sw, sh, W, H);
  }

  // a transition: the picture (for a moment), the transition, then the next picture (for a moment)
  private drawCut(src: CanvasImageSource, preset: Preset, W: number, H: number) {
    const ctx = this.ctx,
      t = this.state.t,
      join = TRANSITION_HOLD + preset.length / 2;
    const films = [
      { reel: 1, s: 0, at: 0, length: join },
      { reel: 2, s: 0, at: join, length: join },
    ];
    const cut = transitionAt(films, [{ reel: 2, s: 0, preset, duration: preset.length }], t);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (cut) applyPose(ctx, cut.pose, W / 2, H / 2, W, H);
    ctx.drawImage(t < join ? src : this.next, 0, 0, W, H);
    ctx.restore();
    if (cut?.passes.length) {
      const gpu = this.painter.apply(ctx, cut.passes);
      if (gpu !== this.state.gpu) this.set({ gpu });
    }
  }

  // before/after: the left half as it was, and a line between
  private drawCompare(src: CanvasImageSource, sw: number, sh: number, W: number, H: number) {
    if (!this.compare) return;
    const ctx = this.ctx;
    ctx.drawImage(src, 0, 0, sw / 2, sh, 0, 0, W / 2, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(W / 2 - 1, 0, 2, H);
  }

  // the renderer, set up for the picture (sw x sh) and a clip of the preset on its object
  private bodyStage(sw: number, sh: number, scene: boolean, preset: Preset) {
    const r = (this.stage ??= new Renderer(new OffscreenCanvas(1, 1)));
    const key = `${sw}x${sh}:${scene}:${preset.length}`;
    if (key !== this.stageFor) {
      this.stageFor = key;
      const { W, H } = workSize(sw, sh);
      r.setup(sw, sh, W, H, MAX_W);
      const frames = testFrames(preset.length);
      r.setClip(frames, new Int32Array(frames.length));
      this.stageClip = { frames, shape: subject(W, H, scene) };
      this.stagePreset = null;
    }
    if (preset !== this.stagePreset && this.stageClip) {
      this.stagePreset = preset;
      r.setLayers([bodyLayer(preset, this.stageClip.frames, this.stageClip.shape)]);
    }
    return r;
  }

  private set(p: Partial<LabState>) {
    this.state = { ...this.state, ...p };
    this.onState({ ...this.state });
  }

  private dropVideo() {
    this.video?.pause();
    this.video?.removeAttribute('src');
    this.video = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}

// a motion preset as a clip's animation: its first pass of each kind
function animOf(p: Preset): ClipAnim {
  const anim = { ...NO_ANIM };
  for (const x of p.passes)
    if (isAnimKind(x.kind) && !anim[x.kind]) anim[x.kind] = { preset: p.id, params: x.params };
  return anim;
}

// the test scene's colors: by day, and at dusk (what a transition cuts to)
const DAY = { sky: ['#2f6fd0', '#c4def5'], sun: '#ffe599', grass: ['#6aa84f', '#2f5a22'] };
const DUSK = { sky: ['#1b1f4a', '#e0784a'], sun: '#fff3c4', grass: ['#3d5a3a', '#16241a'] };

// a scene with what effects are judged on: sky, sun, skin, grass, deep shadow and white
function testScene(colors: typeof DAY) {
  const W = SCENE_W,
    H = SCENE_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, colors.sky[0]);
  sky.addColorStop(1, colors.sky[1]);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = colors.sun;
  g.beginPath();
  g.arc(W * 0.8, H * 0.12, 46, 0, Math.PI * 2);
  g.fill();
  const grass = g.createLinearGradient(0, H * 0.62, 0, H);
  grass.addColorStop(0, colors.grass[0]);
  grass.addColorStop(1, colors.grass[1]);
  g.fillStyle = grass;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  drawPerson(g, '#1d2230', '#e0ac8a');
  g.fillStyle = '#fff';
  g.font = 'bold 72px sans-serif';
  g.fillText('FX', W * 0.66, H * 0.9);
  return c;
}
