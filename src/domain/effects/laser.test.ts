import { describe, expect, it } from 'vitest';
import { beams, carry, chainCam, defaultAim, toEdge, unapplyCam, applyCam } from './laser';

describe('the camera path', () => {
  it('carries a spot from one frame to another', () => {
    // the camera pans: 3 frames later the scene has slid 30 px left on screen
    const f0 = { s: 1, tx: 0, ty: 0 },
      f3 = { s: 1, tx: -30, ty: 0 };
    expect(carry({ x: 100, y: 50 }, f0, f3).at).toEqual({ x: 70, y: 50 });
  });
  it('a camera pulling away shrinks and gathers the scene', () => {
    const f0 = { s: 1, tx: 0, ty: 0 },
      later = { s: 0.5, tx: 50, ty: 50 }; // zoom out about (100, 100)
    const r = carry({ x: 200, y: 100 }, f0, later);
    expect(r.at).toEqual({ x: 150, y: 100 });
    expect(r.scale).toBe(0.5);
  });
  it('chains frame-to-frame moves into a path', () => {
    const step = { s: 1.1, tx: 2, ty: -1 };
    const two = chainCam(chainCam({ s: 1, tx: 0, ty: 0 }, step), step),
      p = { x: 30, y: 40 };
    expect(applyCam(two, p).x).toBeCloseTo(applyCam(step, applyCam(step, p)).x);
    expect(unapplyCam(two, applyCam(two, p)).y).toBeCloseTo(40);
  });
});

describe('beams', () => {
  it('runs to the edge of the frame in the aimed direction', () => {
    expect(toEdge({ x: 50, y: 50 }, 0, 200, 100)).toEqual({ x: 200, y: 50 });
    const up = toEdge({ x: 50, y: 50 }, -90, 200, 100);
    expect(up.x).toBeCloseTo(50);
    expect(up.y).toBeCloseTo(0);
    const diag = toEdge({ x: 50, y: 50 }, 45, 200, 100);
    expect(diag.x).toBeCloseTo(100);
    expect(diag.y).toBeCloseTo(100);
  });
  it('from each source (both eyes) to one target when there is one', () => {
    const eyes = [
        { x: 40, y: 30 },
        { x: 60, y: 30 },
      ],
      target = { x: 150, y: 80 };
    expect(beams(eyes, 0, target, 200, 100)).toEqual([
      { a: eyes[0], b: target },
      { a: eyes[1], b: target },
    ]);
    expect(beams(eyes, 0, null, 200, 100).map(b => b.b.x)).toEqual([200, 200]);
  });
  it('by default points to the side with more room', () => {
    expect(defaultAim({ x: 30, y: 50 }, 200)).toEqual({ deg: 0, target: null });
    expect(defaultAim({ x: 170, y: 50 }, 200)).toEqual({ deg: 180, target: null });
  });
});
