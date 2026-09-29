// The Preset Lab's controller and composition root (like the editor's player.ts): it plays a test
// clip round and round (or shows a test scene when none is loaded), with the preset being made
// drawn over it by the same GPU painter the editor uses, so what's made here looks the same there.
// The effect's own time loops over the preset's length and can be scrubbed; before/after shows the
// left half as it was.
import type { Preset } from '@/domain/effects/presets';
import { looksAt, newLook, textsAt } from '@/domain/project/looks';
import { NO_ANIM, isAnimKind, poseAt, type ClipAnim } from '@/domain/effects/animation';
import { applyPose } from '@/infrastructure/rendering/pose';
import { FALLBACK_FONTS, type Fonts } from '@/infrastructure/rendering/fonts';
import { LookPainter } from '@/infrastructure/rendering/gpu/looks';
import { TextClipPainter } from '@/infrastructure/rendering/textClips';
import { loadFonts } from '../editor/fonts';

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
  private scene = testScene();
  private video: HTMLVideoElement | null = null;
  private url: string | null = null;
  private preset: Preset | null = null;
  private state: LabState = { t: 0, playing: true, clip: null, gpu: true };
  private compare = false;
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
    this.state.t = Math.min(this.state.t, p.length);
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
    this.set({ t: Math.max(0, Math.min(this.preset?.length ?? 0, t)) });
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
      this.state.t = (this.state.t + dt) % this.preset.length;
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
    ctx.drawImage(src, 0, 0, W, H);
    if (!this.preset) return;
    // (a clip of it as long as it is, its controls at their defaults; a text with its type's words)
    const clip = { ...newLook(1, this.preset, 0, this.preset.length), row: 0 };
    const gpu = this.painter.apply(ctx, looksAt([clip], this.state.t));
    if (gpu !== this.state.gpu) this.set({ gpu });
    this.texts.draw(ctx, textsAt([clip], this.state.t), this.fonts);
    if (this.compare) {
      // the left half as it was, and a line between
      ctx.drawImage(src, 0, 0, sw / 2, sh, 0, 0, W / 2, H);
      ctx.fillStyle = '#fff';
      ctx.fillRect(W / 2 - 1, 0, 2, H);
    }
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

// a scene with what effects are judged on: sky, sun, skin, grass, deep shadow and white
function testScene() {
  const W = 540,
    H = 960;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#2f6fd0');
  sky.addColorStop(1, '#c4def5');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe599';
  g.beginPath();
  g.arc(W * 0.8, H * 0.12, 46, 0, Math.PI * 2);
  g.fill();
  const grass = g.createLinearGradient(0, H * 0.62, 0, H);
  grass.addColorStop(0, '#6aa84f');
  grass.addColorStop(1, '#2f5a22');
  g.fillStyle = grass;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  // a person: head and shoulders
  g.fillStyle = '#1d2230';
  g.beginPath();
  g.ellipse(W * 0.42, H * 0.78, 150, 190, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#e0ac8a';
  g.beginPath();
  g.ellipse(W * 0.42, H * 0.46, 78, 96, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 72px sans-serif';
  g.fillText('FX', W * 0.66, H * 0.9);
  return c;
}
