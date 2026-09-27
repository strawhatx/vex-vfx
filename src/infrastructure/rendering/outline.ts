// What the editor draws over the effects while editing: each clip's object outlined in its color
// (the selected one tinted while paused), and the selected laser's target.
import type { Layer } from './layer';
import type { MaskPainter } from './masks';
import { sceneSpotAt, type View } from './view';

const LOST = '#ff4d4d'; // the object wasn't found here: this is a guess

export function drawOutline(
  v: View,
  masks: MaskPainter,
  l: Layer,
  idx: number,
  selected: boolean,
  paused: boolean,
) {
  const frames = l.spec.frames;
  if (!frames[idx].shapes.length) return;
  const ctx = v.ctx;
  const o = l.geo.outline(frames, idx);
  const col = o.lost ? LOST : l.spec.color;

  // a silhouette: glow around it
  if (o.hasShape) {
    if (paused && selected) masks.tint(l.geo.maskCanvas, ctx, l.spec.color, 0.25);
    masks.glow(l.geo.maskCanvas, ctx, col, selected ? 4 : 2, selected ? 1 : 0.7);
    return;
  }

  // only a box: a dashed rectangle
  const t = l.geo.target(frames, idx, 1 / 30, v.shot);
  if (!t.active) return;
  ctx.save();
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeStyle = col;
  ctx.setLineDash(o.lost ? [6, 5] : [10, 6]);
  ctx.strokeRect(t.x - t.rx, t.y - t.ry, t.rx * 2, t.ry * 2);
  ctx.restore();
}

// a crosshair on a laser's target
export function drawLaserTarget(v: View, l: Layer, idx: number) {
  const target = l.spec.aim.target;
  if (!target) return;
  const at = sceneSpotAt(v, target, idx);
  const ctx = v.ctx;
  const r = Math.max(8, v.CW / 60);
  ctx.save();
  ctx.strokeStyle = l.spec.color;
  ctx.lineWidth = 2;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  // four ticks, pointing in
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(at.x + dx * r * 0.5, at.y + dy * r * 0.5);
    ctx.lineTo(at.x + dx * r * 1.6, at.y + dy * r * 1.6);
  }
  ctx.stroke();
  ctx.restore();
}
