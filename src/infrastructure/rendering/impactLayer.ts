// The impacts playing out at a frame: bursts at their hit points, then the camera jolt and flash
// over the whole frame. An impact plays out fully even past the end of its clip's range.
import { IMPACTS } from '@/domain/effects/impacts';
import { PALETTES } from '@/domain/effects/palettes';
import type { LayerSpec } from '@/application/ports';
import { cameraFor, drawHit, screenFlash, type Hit } from './impacts';
import type { Layer } from './layer';
import { carry } from '@/domain/effects/laser';
import { tapAt, type View } from './view';

type Impact = LayerSpec['impacts'][number];

// frame: the output canvas as drawn so far; jolt: a scratch canvas the same size
export function drawImpacts(
  v: View,
  layers: Iterable<Layer>,
  idx: number,
  frame: CanvasImageSource,
  jolt: OffscreenCanvas,
) {
  const hits = hitsAt(v, layers, idx);
  if (!hits.length) return;
  const { ctx, CW, CH } = v;
  for (const h of hits) drawHit(ctx, h);

  // the camera jolt: zoom into the hit, plus enough extra that the shake never shows the edge
  const cam = cameraFor(hits, CW);
  if (cam.k > 1.001 || Math.abs(cam.dx) + Math.abs(cam.dy) > 0.5) {
    const g = jolt.getContext('2d') as OffscreenCanvasRenderingContext2D;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CW, CH);
    g.drawImage(frame, 0, 0);
    const k = cam.k * (1 + 2 * Math.max(Math.abs(cam.dx) / CW, Math.abs(cam.dy) / CH));
    ctx.save();
    ctx.setTransform(k, 0, 0, k, cam.cx * (1 - k) + cam.dx, cam.cy * (1 - k) + cam.dy);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(jolt, 0, 0);
    ctx.restore();
  }

  const flash = screenFlash(hits);
  if (flash > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }
}

// every impact playing out at frame idx. A stretched impact plays its burst slower, a squeezed one
// faster, filling its clip.
function hitsAt(v: View, layers: Iterable<Layer>, idx: number) {
  const t = v.clip[idx].t;
  const hits: Hit[] = [];
  for (const l of layers) {
    if (l.spec.frames.length !== v.clip.length) continue;
    const len = l.spec.range.e - l.spec.range.s;
    for (const m of l.spec.impacts) {
      const look = IMPACTS[m.style];
      const age = t - v.clip[m.i].t;
      if (age < -1e-6 || age >= len) continue;
      const burstAge = (Math.max(0, age) * look.duration) / Math.max(1e-3, len);
      hits.push(hitAt(v, l, m, idx, burstAge, look));
    }
  }
  return hits;
}

// where and which way an impact hits: the spot that was tapped, carried along with the object to
// the hit frame (or the object's middle, or the nearest frame it was found), moving the way it was
// just before.
//
// While it plays out (at frame idx), the burst stays stuck to the scene: it's carried along the
// camera's path (or, until that's worked out, with the object), so a panning or zooming camera
// doesn't leave it hanging in the air.
function hitAt(v: View, l: Layer, m: Impact, idx: number, age: number, look: Hit['look']): Hit {
  const { i, id } = m;
  const frames = l.spec.frames;
  const geo = l.geo;
  const dt = frames[i].dur || 1 / 30;

  // the object at the hit, or the nearest frame it was found
  let tg = geo.target(frames, i, dt, v.shot);
  for (let d = 1; !tg.active && d <= 6; d++) {
    for (const j of [i - d, i + d]) {
      if (!tg.active && j >= 0 && j < frames.length) tg = geo.target(frames, j, dt, v.shot);
    }
  }
  const tapped = m.tap && tapAt(v, frames, m.tap, i);
  let x = tapped ? tapped.x : tg.active ? tg.x : v.CW / 2;
  let y = tapped ? tapped.y : tg.active ? tg.y : v.CH / 2;
  const objectSize = tg.active ? Math.sqrt(tg.rx * tg.ry) : v.CW * 0.08;
  let size = Math.max(v.CW * 0.04, objectSize) * l.spec.settings.size;

  const camHit = v.cam[i];
  const camNow = v.cam[idx];
  if (camHit && camNow) {
    // carried with the camera: the burst sits on the spot and scales with it
    const r = carry({ x: x / v.q, y: y / v.q }, camHit, camNow);
    x = r.at.x * v.q;
    y = r.at.y * v.q;
    size *= r.scale;
  } else if (tg.active) {
    // carried with the object: where it is now (or was last found since the hit)
    let now = tg;
    for (let j = idx; j > i; j--) {
      const t = geo.target(frames, j, dt, v.shot);
      if (t.active) {
        now = t;
        break;
      }
    }
    if (now !== tg) {
      const u = (x - tg.x) / Math.max(1, tg.rx);
      const w = (y - tg.y) / Math.max(1, tg.ry);
      x = now.x + u * now.rx;
      y = now.y + w * now.ry;
      size *= Math.sqrt((now.rx * now.ry) / Math.max(1, tg.rx * tg.ry));
    }
  }

  // the direction it was moving a couple of frames before the hit, before it stopped
  const before = geo.target(frames, Math.max(0, i - 2), dt, v.shot);
  const vx = before.active ? before.vx : 0;
  const vy = before.active ? before.vy : 0;
  const dir = Math.hypot(vx, vy) > size * 0.6 ? Math.atan2(vy, vx) : null;

  return { age, x, y, size, dir, look, colors: PALETTES[l.spec.settings.pal].c, seed: id * 7919 + l.spec.id };
}
