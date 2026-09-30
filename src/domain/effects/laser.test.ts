import { describe, expect, it } from 'vitest';
import { applyCam, beamPath, carry, chainCam, defaultAim, normalAim, unapplyCam } from './laser';

describe('the camera path', () => {
  it('carries a spot from one frame to another', () => {
    // the camera pans: 3 frames later the scene has slid 30 px left on screen
    const f0 = { s: 1, tx: 0, ty: 0 };
    const f3 = { s: 1, tx: -30, ty: 0 };
    expect(carry({ x: 100, y: 50 }, f0, f3).at).toEqual({ x: 70, y: 50 });
  });
  it('a camera pulling away shrinks and gathers the scene', () => {
    const f0 = { s: 1, tx: 0, ty: 0 };
    const later = { s: 0.5, tx: 50, ty: 50 }; // zoom out about (100, 100)
    const r = carry({ x: 200, y: 100 }, f0, later);
    expect(r.at).toEqual({ x: 150, y: 100 });
    expect(r.scale).toBe(0.5);
  });
  it('chains frame-to-frame moves into a path', () => {
    const step = { s: 1.1, tx: 2, ty: -1 };
    const two = chainCam(chainCam({ s: 1, tx: 0, ty: 0 }, step), step);
    const p = { x: 30, y: 40 };
    expect(applyCam(two, p).x).toBeCloseTo(applyCam(step, applyCam(step, p)).x);
    expect(unapplyCam(two, applyCam(two, p)).y).toBeCloseTo(40);
  });
});

describe('aiming', () => {
  it('by default fires sideways, to the side with more room', () => {
    expect(defaultAim({ x: 30, y: 50 }, 200)).toEqual({ h: 90, v: 0, target: null });
    expect(defaultAim({ x: 170, y: 50 }, 200)).toEqual({ h: -90, v: 0, target: null });
  });
  it('wraps left-right around and stops up-down at straight up or down', () => {
    expect(normalAim(270, 0).h).toBe(-90);
    expect(normalAim(180, 0).h).toBe(180);
    expect(normalAim(0, 120).v).toBe(90);
    expect(normalAim(0, -95).v).toBe(-90);
  });
});

describe('the beam on screen', () => {
  const W = 200;
  const H = 100;
  const last = (h: number, v: number, src = { x: 60, y: 40 }) => beamPath(src, h, v, W, H).at(-1)!;

  it('sideways: straight across to the edge, the same width all the way', () => {
    const end = last(90, 0);
    expect(end.x).toBeGreaterThanOrEqual(W);
    expect(end.y).toBeCloseTo(40);
    expect(end.w).toBeCloseTo(1);
    expect(last(-90, 0).x).toBeLessThanOrEqual(0);
  });

  it('up and down: to the top or the bottom', () => {
    expect(last(90, -90).y).toBeLessThanOrEqual(0);
    expect(last(90, 90).y).toBeGreaterThanOrEqual(H);
  });

  it('at the camera: comes straight out of its source, swelling', () => {
    const path = beamPath({ x: 60, y: 40 }, 0, 0, W, H);
    const end = path.at(-1)!;
    expect(end.x).toBeCloseTo(60);
    expect(end.y).toBeCloseTo(40);
    expect(end.w).toBeGreaterThan(5);
    for (let k = 1; k < path.length; k++) expect(path[k].w).toBeGreaterThanOrEqual(path[k - 1].w);
  });

  it('turning a beam that comes at the camera a little moves it that way', () => {
    expect(last(10, 0).x).toBeGreaterThan(60);
    expect(last(-10, 0).x).toBeLessThan(60);
    expect(last(0, 10).y).toBeGreaterThan(40);
    expect(last(0, -10).y).toBeLessThan(40);
  });

  it('away into the scene: narrows as it goes', () => {
    const end = last(160, 0);
    expect(end.w).toBeLessThan(0.1);
    expect(end.x).toBeGreaterThan(60);
  });
});
