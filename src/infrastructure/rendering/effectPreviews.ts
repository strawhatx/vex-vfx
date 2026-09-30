// Pictures of object effects, for their menu: each drawn by the renderer, just as in the editor, on
// a photo of a person (public/previews: the photo, and the person's mask, made once with the
// segmenter), a moment into the effect, cut down to a square round them.
import { DEFAULT_FX } from '@/application/editor';
import type { LayerSpec } from '@/application/ports';
import { isBodyPass } from '@/domain/effects/passes';
import { controlDefaults, passesWith, type Preset } from '@/domain/effects/presets';
import { encodeRle, workSize, type Shape, type TrackFrame } from '@/domain/tracking/types';
import { Renderer } from './renderer';

const PHOTO = '/previews/person.jpg',
  MASK = '/previews/person-mask.png';
// the frames a second of the clip it's drawn in
const FPS = 30;
// how far into an effect it's shown (s): long enough for its particles to have built up
const AT = 1.5;
// the square cut out: from this far down the photo (just above the person's hair)
const TOP = 0.06;

export class EffectPreviews {
  private renderer = new Renderer(new OffscreenCanvas(1, 1));

  private constructor(
    private photo: ImageBitmap,
    private shape: Shape,
  ) {
    const { width: w, height: h } = photo;
    const work = workSize(w, h);
    this.renderer.setup(w, h, work.W, work.H, w);
  }

  // the photo and the person in it, loaded
  static async load() {
    const [photo, mask] = await Promise.all([bitmap(PHOTO), bitmap(MASK)]);
    const work = workSize(photo.width, photo.height);
    return new EffectPreviews(photo, personShape(mask, work.W, work.H));
  }

  // object effect `preset` on the person, as a size x size JPEG
  async picture(preset: Preset, size: number): Promise<Blob> {
    const len = Math.max(preset.length, AT + 0.1);
    const frames: TrackFrame[] = Array.from({ length: Math.ceil(len * FPS) }, (_, k) => ({
      t: k / FPS,
      dur: 1 / FPS,
      shapes: [this.shape],
    }));
    const r = this.renderer;
    r.setClip(frames, new Int32Array(frames.length));
    r.setLayers([layerOf(preset, frames)]);
    r.render(this.photo, Math.min(AT, preset.length * 0.6), { outline: false, paused: true, selected: null });
    const out = new OffscreenCanvas(size, size);
    const g = out.getContext('2d')!;
    const { width: cw, height: ch } = r.canvas;
    g.drawImage(r.canvas, 0, ch * TOP, cw, cw, 0, 0, size, size);
    return out.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  }
}

async function bitmap(url: string) {
  return createImageBitmap(await (await fetch(url)).blob());
}

// the preset as a clip on the person, its controls at their defaults
function layerOf(preset: Preset, frames: TrackFrame[]): LayerSpec {
  return {
    id: 1,
    kind: 'effect',
    pinned: false,
    frames,
    settings: DEFAULT_FX,
    passes: passesWith(preset, controlDefaults(preset)).filter(isBodyPass),
    color: '#fff',
    range: { s: 0, e: frames[frames.length - 1].t + 1 / FPS },
    aim: { h: 90, v: 0, target: null },
    tap: null,
    impacts: [],
    cutout: null,
  };
}

// the person as a tracked shape, from their mask, in a w x h (work pixels) frame
function personShape(maskImage: ImageBitmap, w: number, h: number): Shape {
  const c = new OffscreenCanvas(w, h),
    g = c.getContext('2d')!;
  g.drawImage(maskImage, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data,
    mask = new Uint8Array(w * h);
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 127) {
        mask[y * w + x] = 1;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return {
    id: 1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    mask: encodeRle(mask, w, x0, y0, x1, y1),
  };
}
