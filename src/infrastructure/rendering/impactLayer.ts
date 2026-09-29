// The impacts playing out at a frame: bursts at their spots in the scene (explosions with their
// fireball, smoke and debris; shockwaves with their rings of particles), then the camera jolt and
// flash over the whole frame. An impact plays out fully even past the end of its clip's range.
import { PALETTES } from '@/domain/effects/palettes';
import type { LayerSpec } from '@/application/ports';
import { drawExplosion } from './explosion';
import { drawNova, novaWave } from './nova';
import { drawWord } from './words';
import { drawSplash } from './splash';
import { distortWave, drawWave } from './shockwave';
import { cameraFor, drawHit, screenFlash, type Hit } from './impacts';
import type { ImpactParticles } from './impactParticles';
import type { Layer } from './layer';
import { sceneSpotAt, type View } from './view';

type Impact = LayerSpec['impacts'][number];

// frame: the output canvas as drawn so far; jolt: a scratch canvas the same size; particles: the
// impacts' emitters
export function drawImpacts(
  v: View,
  layers: Iterable<Layer>,
  idx: number,
  frame: CanvasImageSource,
  jolt: OffscreenCanvas,
  particles: ImpactParticles,
) {
  const hits = hitsAt(v, layers, idx);
  particles.sweep();
  if (!hits.length) return;
  const { ctx, CW, CH } = v;
  for (const h of hits) {
    const { explosion, wave, nova } = h.look;
    // the picture bends first, then the fire, smoke and debris, the shockwave's particles, and
    // the flash and sparks on top
    if (wave) distortWave(ctx, h, wave, frame, jolt);
    if (nova) distortWave(ctx, h, novaWave(nova), frame, jolt);
    if (explosion) drawExplosion(ctx, h, explosion);
    if (wave) drawWave(ctx, h, wave);
    if (nova) drawNova(ctx, h, nova);
    if (h.look.splash) drawSplash(ctx, h, h.look.splash);
    particles.draw(ctx, h);
    drawHit(ctx, h);
    if (h.look.word) drawWord(ctx, h, h.look.word, v.fonts);
  }

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
      const look = m.look;
      const age = t - v.clip[m.i].t;
      if (age < -1e-6 || age >= len) continue;
      const burstAge = (Math.max(0, age) * look.duration) / Math.max(1e-3, len);
      hits.push(sceneImpactAt(v, l, m, idx, burstAge, look));
    }
  }
  return hits;
}

// an impact: at the spot tapped in the scene, carried along with the camera (it
// grows and shrinks as the camera zooms), sized to the frame
function sceneImpactAt(v: View, l: Layer, m: Impact, idx: number, age: number, look: Hit['look']): Hit {
  const spot = m.tap ?? { i: m.i, x: v.CW / v.q / 2, y: v.CH / v.q / 2 };
  const { x, y } = sceneSpotAt(v, spot, idx);
  const from = v.cam[spot.i];
  const to = v.cam[idx];
  const scale = from && to ? to.s / from.s : 1;
  const size = v.CW * look.size * l.spec.settings.size * scale;
  return {
    age,
    x,
    y,
    size,
    look,
    colors: PALETTES[l.spec.settings.pal].c,
    seed: m.id * 7919 + l.spec.id,
  };
}
