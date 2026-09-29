// Draws the film's effect clips (see domain/project/effectClips.ts): each plays its library video in
// a video element of its own, kept in step with the film (while playing, set back on time when it
// drifts; while paused, sought to the frame, then drawn again once it's there), placed, faded and
// blended in: screened or added onto the picture, keyed (see gpu/keyer.ts), or as it is. Where each
// was drawn is kept, so a tap can find it.
import type { EffectClip } from '@/domain/project/effectClips';
import { Keyer } from './gpu/keyer';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// while playing, how far a clip's video can drift before it's set back on time (s)
const DRIFT = 0.25;
// the widest a video is keyed at (px): plenty for an effect laid over the frame
const KEY_W = 720;

interface Box {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export class EffectClipPainter {
  private videos = new Map<number, { el: HTMLVideoElement; url: string }>();
  private files = new Map<string, Blob>();
  private keyer = new Keyer();
  private boxes: Box[] = [];

  // seeked: a paused clip's video got to its frame (so it can be drawn again)
  constructor(private seeked: () => void) {}

  // the library videos the clips play, by id
  setFiles(files: readonly { id: string; file: Blob }[]) {
    for (const f of files) this.files.set(f.id, f.file);
  }

  // the clips playing now (each with the time in its video), over ctx's canvas; playing: the film is
  // playing (their videos play along); outline: a dashed box round the selected one
  draw(
    ctx: Ctx,
    clips: readonly { clip: EffectClip; time: number }[],
    opts: { playing: boolean; selected?: number | null; outline?: boolean },
  ) {
    const { width: W, height: H } = ctx.canvas;
    const on = new Set(clips.map(c => c.clip.id));
    for (const [id, v] of this.videos) if (!on.has(id) && !v.el.paused) v.el.pause();
    this.boxes = [];
    for (const { clip: c, time } of clips) {
      const v = this.video(c);
      if (!v) continue;
      this.sync(v, time, opts.playing);
      if (v.readyState < 2 || !v.videoWidth) continue;
      const w = c.scale * W * 0.5,
        h = (w * v.videoHeight) / v.videoWidth;
      const box = { id: c.id, x: c.x * W, y: c.y * H, w, h, rot: (c.rot * Math.PI) / 180 };
      this.boxes.push(box);
      const picture = c.blend === 'key' ? this.keyed(v, c.tolerance) : v;
      if (!picture) continue;
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.rotate(box.rot);
      ctx.globalAlpha = c.opacity;
      ctx.globalCompositeOperation =
        c.blend === 'screen' ? 'screen' : c.blend === 'add' ? 'lighter' : 'source-over';
      ctx.drawImage(picture, -w / 2, -h / 2, w, h);
      ctx.restore();
      if (opts.outline && opts.selected === c.id) {
        ctx.save();
        ctx.translate(box.x, box.y);
        ctx.rotate(box.rot);
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }

  // the top clip drawn at (x, y) last time, if any
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

  destroy() {
    for (const v of this.videos.values()) {
      v.el.pause();
      v.el.removeAttribute('src');
      URL.revokeObjectURL(v.url);
    }
    this.videos.clear();
  }

  // clip c's video element (made the first time; none without its file)
  private video(c: EffectClip) {
    const had = this.videos.get(c.id);
    if (had) return had.el;
    const file = this.files.get(c.pack);
    if (!file) return null;
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    const url = URL.createObjectURL(file);
    el.src = url;
    el.addEventListener('seeked', () => this.seeked());
    el.addEventListener('loadeddata', () => this.seeked());
    this.videos.set(c.id, { el, url });
    return el;
  }

  private sync(v: HTMLVideoElement, time: number, playing: boolean) {
    if (playing) {
      if (v.paused) {
        v.currentTime = time;
        void v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - time) > DRIFT) v.currentTime = time;
      return;
    }
    if (!v.paused) v.pause();
    if (!v.seeking && Math.abs(v.currentTime - time) > 0.02) v.currentTime = time;
  }

  // the video's frame with its green keyed out, no wider than KEY_W
  private keyed(v: HTMLVideoElement, tolerance: number) {
    const k = Math.min(1, KEY_W / v.videoWidth);
    return this.keyer.render(v, Math.round(v.videoWidth * k), Math.round(v.videoHeight * k), tolerance);
  }
}
