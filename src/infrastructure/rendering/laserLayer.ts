// A laser at a frame: a beam from each of the part's source spots (both eyes, a fingertip), or the
// tapped spot on an object, in its direction to the frame's edge, or to its target in the scene.
import { beams } from '@/domain/effects/laser';
import { PALETTES } from '@/domain/effects/palettes';
import { drawBeam } from './laser';
import type { Layer } from './layer';
import { sceneSpotAt, tapAt, type View } from './view';

export function drawLaser(v: View, l: Layer, idx: number) {
  const shape = l.spec.frames[idx].shapes[0];
  if (!shape) return;
  const { q } = v;
  const s = l.spec.settings;
  const aim = l.spec.aim;

  const points = shape.points ?? [];
  const tapped = l.spec.tap && tapAt(v, l.spec.frames, l.spec.tap, idx);
  const sources = points.length
    ? points.map(p => ({ x: p.x * q, y: p.y * q }))
    : [tapped ?? { x: shape.cx * q, y: shape.cy * q }];
  const target = aim.target && sceneSpotAt(v, aim.target, idx);

  // sized to the part, but never thinner than a sliver of the frame, so a beam from a small part
  // (the eyes) still reads; thinner when there are several
  const width =
    Math.max(v.CW / 260, (Math.sqrt(shape.w * shape.h) * q) / 14) * s.size * (points.length > 1 ? 0.6 : 1);

  const colors = PALETTES[s.pal].c;
  const t = v.clip[idx].t;
  beams(sources, aim.deg, target, v.CW, v.CH).forEach((b, k) =>
    drawBeam(v.ctx, b.a, b.b, width, colors, s.intensity, t, l.spec.id * 13 + k, !!target),
  );
}
