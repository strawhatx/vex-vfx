// A laser at a frame. From the eyes it's one thick beam spanning both eyes, each eye blazing with a
// starburst on top (like Cyclops); from a hand or foot it comes from the fingertip or toe; on an
// object, from the spot tapped. It goes in its 3D direction (swelling as it comes at the camera),
// or straight to its target in the scene.
import { beamPath, type BeamPoint } from '@/domain/effects/laser';
import { PALETTES } from '@/domain/effects/palettes';
import { drawBeam, drawEyeBurst } from './laser';
import type { Layer } from './layer';
import { sceneSpotAt, tapAt, type View } from './view';

export function drawLaser(v: View, l: Layer, idx: number) {
  const shape = l.spec.frames[idx].shapes[0];
  if (!shape) return;
  const { q } = v;
  const s = l.spec.settings;
  const aim = l.spec.aim;

  // where it starts, and how wide it is there
  const points = (shape.points ?? []).map(p => ({ x: p.x * q, y: p.y * q }));
  let source;
  let width;
  const eyes = points.length >= 2 ? points.slice(0, 2) : [];
  const eyeGap = eyes.length ? Math.hypot(eyes[1].x - eyes[0].x, eyes[1].y - eyes[0].y) : 0;
  if (eyes.length) {
    // both eyes: one beam from between them, wide enough to take both in
    source = { x: (eyes[0].x + eyes[1].x) / 2, y: (eyes[0].y + eyes[1].y) / 2 };
    width = eyeGap * 0.85;
  } else {
    const tapped = l.spec.tap && tapAt(v, l.spec.frames, l.spec.tap, idx);
    source = points[0] ?? tapped ?? { x: shape.cx * q, y: shape.cy * q };
    width = (Math.sqrt(shape.w * shape.h) * q) / 8;
  }
  width = Math.max(v.CW / 90, width) * s.size;

  const target = aim.target && sceneSpotAt(v, aim.target, idx);
  const path: BeamPoint[] = target
    ? [
        { ...source, w: 1 },
        { ...target, w: 1 },
      ]
    : beamPath(source, aim.h, aim.v, v.CW, v.CH);

  const colors = PALETTES[s.pal].c;
  const t = v.clip[idx].t;
  drawBeam(v.ctx, path, width, colors, s.intensity, t, l.spec.id * 13, !!target);
  // each eye blazing, on top of the beam
  const burst = Math.max(v.CW / 45, eyeGap * 1.1) * s.size;
  eyes.forEach((e, k) => drawEyeBurst(v.ctx, e, burst, colors, s.intensity, t, l.spec.id * 31 + k));
}
