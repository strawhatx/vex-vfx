import { describe, expect, it } from 'vitest';
import { FrameMove, ownMotion } from './camera';
import { loadPyr, makePyr } from './flow';
import { ObjectTracker } from './objectTracker';

const W = 320,
  H = 180;

// a smooth random texture (value noise on an 8 px grid), the same for the same seed
function texture(seed: number) {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 2 ** 32) * 255;
  const G = 8,
    gw = 128,
    grid = Array.from({ length: gw * gw }, rnd);
  return (x: number, y: number) => {
    const gx = (((x / G) % gw) + gw) % gw,
      gy = (((y / G) % gw) + gw) % gw;
    const x0 = Math.floor(gx),
      y0 = Math.floor(gy),
      fx = gx - x0,
      fy = gy - y0,
      at = (a: number, b: number) => grid[(b % gw) * gw + (a % gw)];
    return (
      (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
      (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    );
  };
}

// a frame: `bg` shifted by (dx, dy), with `obj` (if given) in a box at its place on screen
function frame(
  bg: (x: number, y: number) => number,
  dx: number,
  dy: number,
  obj?: { tex: (x: number, y: number) => number; x0: number; y0: number; size: number },
) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inObj = obj && x >= obj.x0 && x < obj.x0 + obj.size && y >= obj.y0 && y < obj.y0 + obj.size;
      const v = inObj ? obj.tex(x - obj.x0, y - obj.y0) : bg(x - dx, y - dy);
      rgba.set([v, v, v, 255], (y * W + x) * 4);
    }
  return rgba;
}

describe('the camera’s move from frame to frame', () => {
  const bg = texture(1);

  it('is measured over the frame', () => {
    const P = makePyr(W, H),
      N = makePyr(W, H);
    loadPyr(frame(bg, 0, 0), P, W, H);
    loadPyr(frame(bg, 4, -2), N, W, H);
    const cam = new FrameMove(W, H).fit(P, N)!;
    expect(cam.tx).toBeCloseTo(4, 0);
    expect(cam.ty).toBeCloseTo(-2, 0);
    expect(cam.s).toBeCloseTo(1, 2);
  });

  it('leaves out an object moving on its own, and the area asked to skip', () => {
    const P = makePyr(W, H),
      N = makePyr(W, H),
      tex = texture(2);
    loadPyr(frame(bg, 0, 0, { tex, x0: 120, y0: 50, size: 80 }), P, W, H);
    loadPyr(frame(bg, 4, 0, { tex, x0: 110, y0: 50, size: 80 }), N, W, H);
    const cam = new FrameMove(W, H).fit(P, N, { cx: 160, cy: 90, w: 110, h: 110 })!;
    expect(cam.tx).toBeCloseTo(4, 0);
  });

  it('tells the points that moved on their own from those the camera moved', () => {
    const cam = { s: 1, tx: 4, ty: 0 };
    const olds = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
    ];
    expect(
      ownMotion(
        olds,
        [
          [14, 10],
          [50, 10],
        ],
        cam,
        1,
      ),
    ).toEqual([1]);
  });
});

describe('following an object while the camera pans', () => {
  it('stays on the object, not the background moving through its box', () => {
    // the camera pans along with a small object (so it holds still on screen) while the scene
    // behind slides by 4 px a frame; its box (a bit bigger than it) is mostly background
    const bg = texture(3),
      tex = texture(4);
    const obj = { tex, x0: 145, y0: 75, size: 30 };
    const t = new ObjectTracker(W, H, () => new Uint8Array(W * H));
    t.start(frame(bg, 0, 0, obj), { x: 160, y: 90 });
    let s = t.step(frame(bg, 4, 0, obj));
    for (let k = 2; k <= 12; k++) s = t.step(frame(bg, 4 * k, 0, obj));
    expect(Math.abs(s.cx - 160)).toBeLessThan(6);
    expect(Math.abs(s.cy - 90)).toBeLessThan(6);
  });
});
