// Drawing something moved by an animation's pose (see domain/effects/animation.ts).
import type { ClipPose } from '@/domain/effects/animation';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// moves what's drawn next as an animation's pose says: about (cx, cy), in a W x H picture (so its
// moves are fractions of it), faded and blurred
export function applyPose(ctx: Ctx, p: ClipPose, cx: number, cy: number, W: number, H: number) {
  ctx.translate(cx + p.x * W, cy + p.y * H);
  ctx.rotate(p.rot);
  ctx.scale(p.scale, p.scale);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha *= Math.max(0, Math.min(1, p.alpha));
  if (p.blur > 1e-4) ctx.filter = `blur(${(p.blur * W).toFixed(1)}px)`;
}
