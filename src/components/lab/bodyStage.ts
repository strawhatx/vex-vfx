// What the Preset Lab tries body effects and impacts on: a clip as long as the preset, 30 frames a
// second, with its object found in every frame: the person in the test scene (their silhouette), or
// on a test clip, a box in its middle (nothing's tracked in the lab). An impact goes off at its
// start, in the middle of the frame. The renderer draws them just as it would in the editor.
import { DEFAULT_FX } from '@/application/editor';
import type { LayerSpec } from '@/application/ports';
import { lookOf, soundOfBurst } from '@/domain/effects/bursts';
import { isBodyPass } from '@/domain/effects/passes';
import { controlDefaults, passesWith, type Preset } from '@/domain/effects/presets';
import { encodeRle, type Shape, type TrackFrame } from '@/domain/tracking/types';

// the test scene's size, which the person is drawn to
export const SCENE_W = 540,
  SCENE_H = 960;

const FPS = 30;

// the test scene's person: head and shoulders, in a SCENE_W x SCENE_H picture
export function drawPerson(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  body: string,
  skin: string,
) {
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(SCENE_W * 0.42, SCENE_H * 0.78, 150, 190, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(SCENE_W * 0.42, SCENE_H * 0.46, 78, 96, 0, 0, Math.PI * 2);
  g.fill();
}

// the clip's frames, over len seconds
export const testFrames = (len: number): TrackFrame[] =>
  Array.from({ length: Math.max(1, Math.ceil(len * FPS)) }, (_, k) => ({
    t: k / FPS,
    dur: 1 / FPS,
    shapes: [],
  }));

// the object in a W x H (work pixels) frame: the test scene's person, or a box in the middle
export function subject(W: number, H: number, scene: boolean): Shape {
  if (!scene) return { id: 1, cx: W / 2, cy: H * 0.55, w: W * 0.4, h: H * 0.6 };
  const c = new OffscreenCanvas(W, H),
    g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.scale(W / SCENE_W, H / SCENE_H);
  drawPerson(g, '#fff', '#fff');
  const px = g.getImageData(0, 0, W, H).data,
    mask = new Uint8Array(W * H);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 127) {
        mask[y * W + x] = 1;
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
    mask: encodeRle(mask, W, x0, y0, x1, y1),
  };
}

// the preset as a clip on that object, its controls at their defaults
export function bodyLayer(preset: Preset, frames: TrackFrame[], shape: Shape): LayerSpec {
  const passes = passesWith(preset, controlDefaults(preset)).filter(isBodyPass);
  return {
    id: 1,
    kind: 'effect',
    pinned: false,
    frames: frames.map(f => ({ ...f, shapes: [shape] })),
    settings: DEFAULT_FX,
    passes,
    color: '#fff',
    range: { s: 0, e: preset.length },
    aim: { h: 90, v: 0, target: null },
    tap: null,
    impacts: [],
    cutout: null,
  };
}

// the preset as an impact going off at the clip's start, in the middle of a W x H (work pixels) frame
export function burstLayer(preset: Preset, frames: TrackFrame[], W: number, H: number): LayerSpec {
  const passes = passesWith(preset, controlDefaults(preset));
  const look = lookOf(passes, preset.name);
  return {
    ...bodyLayer(preset, frames, { id: 1, cx: 0, cy: 0, w: 0, h: 0 }),
    kind: 'impact',
    pinned: true,
    frames: frames.map(f => ({ ...f, shapes: [] })),
    passes: null,
    range: { s: 0, e: look.duration },
    impacts: [{ id: 1, i: 0, style: soundOfBurst(passes), look, tap: { i: 0, x: W / 2, y: H * 0.55 } }],
  };
}
