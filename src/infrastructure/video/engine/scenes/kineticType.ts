// kinetic-type: large text animates in with the scene's move (word-slam, word-pop, mask-reveal,
// letter-stagger, typewriter, highlight-swipe); *key words* show in the brand colour.
import type { KineticType } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { drawText, fitSize, layoutText, textSeconds } from '../text';
import { display, lin, titleStyle, type SceneCtx } from './common';

export function drawKineticType(g: Ctx2D, c: SceneCtx, s: KineticType) {
  const { G } = c;
  const base = titleStyle(c, G.title * 1.15);
  const size = fitSize(g, s.text, base, G.maxW, 3, px => display(c, px));
  const style = { ...base, size, font: display(c, size) };
  const L = layoutText(g, s.text, style, G.maxW, 3);
  drawText(g, L, style, s.move, lin(c, 0.1, textSeconds(s.move, L)), G.cx, G.cy, c.t);
}
