// Draws one part of the video: a scene (with its subtitle) or the end card.
import type { Scene } from '@/domain/video/scenes';
import type { Ctx2D } from '../../canvas';
import { drawAmbientWall } from './ambientWall';
import { drawCardStack } from './cardStack';
import type { SceneCtx } from './common';
import { drawEndCard } from './endCard';
import { drawKineticType } from './kineticType';
import { drawLogoReveal } from './logoReveal';
import { drawStatCounter } from './statCounter';
import { drawStatRing } from './statRing';
import { drawSubtitles } from './subtitles';

export type { SceneCtx } from './common';

export function drawScene(g: Ctx2D, c: SceneCtx, s: Scene, captions: boolean) {
  switch (s.type) {
    case 'logo-reveal':
      drawLogoReveal(g, c, s.name, s.tagline);
      break;
    case 'stat-counter':
      drawStatCounter(g, c, s);
      break;
    case 'stat-ring':
      drawStatRing(g, c, s);
      break;
    case 'card-stack':
      drawCardStack(g, c, s);
      break;
    case 'ambient-wall':
      drawAmbientWall(g, c, s);
      break;
    case 'kinetic-type':
      drawKineticType(g, c, s);
      break;
  }
  if (captions) drawSubtitles(g, c, s.caption);
}

export { drawEndCard };
