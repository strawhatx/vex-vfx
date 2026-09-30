// Optical flow shared by the trackers: image pyramids of analysis frames, and pyramidal
// Lucas-Kanade, which finds where a small patch around a point moved to in the next frame.

export type Img = { w: number; h: number; d: Float32Array };
export type Pyr = Img[];

export const LEVELS = 4,
  WIN = 5,
  WS = 2 * WIN + 1,
  NW = WS * WS;

export function samp(img: Img, x: number, y: number) {
  const w = img.w,
    h = img.h;
  if (x < 0) x = 0;
  else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0;
  else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0,
    y0 = y | 0,
    fx = x - x0,
    fy = y - y0,
    i = y0 * w + x0,
    d = img.d;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy;
}
export const median = (arr: ArrayLike<number>) => {
  const a = Array.from(arr).sort((x, y) => x - y),
    m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export function makePyr(W: number, H: number): Pyr {
  const p: Pyr = [];
  let w = W,
    h = H;
  for (let l = 0; l < LEVELS; l++) {
    p.push({ w, h, d: new Float32Array(w * h) });
    w = Math.max(8, w >> 1);
    h = Math.max(8, h >> 1);
  }
  return p;
}

// fills a pyramid from an RGBA frame (W x H): grayscale, then halved level by level
export function loadPyr(d: Uint8ClampedArray, pyr: Pyr, W: number, H: number) {
  const g = pyr[0].d;
  for (let i = 0, j = 0; i < W * H; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  for (let l = 1; l < LEVELS; l++) {
    const s = pyr[l - 1],
      t = pyr[l];
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const sx = Math.min(s.w - 2, x * 2),
          sy = Math.min(s.h - 2, y * 2),
          i = sy * s.w + sx;
        t.d[y * t.w + x] = (s.d[i] + s.d[i + 1] + s.d[i + s.w] + s.d[i + s.w + 1]) * 0.25;
      }
  }
}

export class LucasKanade {
  private tI = new Float32Array(NW);
  private tX = new Float32Array(NW);
  private tY = new Float32Array(NW);

  // where the point (x, y) in P moved to in N (starting from a guessed move gx0, gy0); null where
  // there's too little texture to tell
  track(P: Pyr, N: Pyr, x: number, y: number, gx0: number, gy0: number): [number, number] | null {
    const { tI, tX, tY } = this,
      top = 1 << (LEVELS - 1);
    let gx = gx0 / top,
      gy = gy0 / top;
    for (let L = LEVELS - 1; L >= 0; L--) {
      const s = 1 << L,
        I = P[L],
        J = N[L],
        px = x / s,
        py = y / s;
      let sxx = 0,
        sxy = 0,
        syy = 0,
        n = 0;
      for (let dy = -WIN; dy <= WIN; dy++)
        for (let dx = -WIN; dx <= WIN; dx++) {
          const ix = (samp(I, px + dx + 1, py + dy) - samp(I, px + dx - 1, py + dy)) * 0.5;
          const iy = (samp(I, px + dx, py + dy + 1) - samp(I, px + dx, py + dy - 1)) * 0.5;
          tI[n] = samp(I, px + dx, py + dy);
          tX[n] = ix;
          tY[n] = iy;
          sxx += ix * ix;
          sxy += ix * iy;
          syy += iy * iy;
          n++;
        }
      const det = sxx * syy - sxy * sxy;
      const minEig = (sxx + syy - Math.sqrt((sxx - syy) * (sxx - syy) + 4 * sxy * sxy)) / 2 / NW;
      if (minEig < 0.15 || det <= 0) {
        if (L === 0) return null;
        gx *= 2;
        gy *= 2;
        continue;
      }
      let vx = 0,
        vy = 0;
      for (let it = 0; it < 12; it++) {
        let bx = 0,
          by = 0,
          m = 0;
        for (let dy = -WIN; dy <= WIN; dy++)
          for (let dx = -WIN; dx <= WIN; dx++) {
            const diff = tI[m] - samp(J, px + dx + gx + vx, py + dy + gy + vy);
            bx += diff * tX[m];
            by += diff * tY[m];
            m++;
          }
        const ex = (syy * bx - sxy * by) / det,
          ey = (sxx * by - sxy * bx) / det;
        vx += ex;
        vy += ey;
        if (ex * ex + ey * ey < 0.0009) break;
      }
      if (L > 0) {
        gx = 2 * (gx + vx);
        gy = 2 * (gy + vy);
      } else {
        gx += vx;
        gy += vy;
      }
    }
    return [x + gx, y + gy];
  }
}
