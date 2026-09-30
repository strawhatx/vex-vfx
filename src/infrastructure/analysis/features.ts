// Comparing bits of image: points worth following (corners), how alike two small patches are, and
// a box's appearance as a vector (to recognise the object again after losing it).
import { samp, WIN, type Img } from './flow';

// up to `max` points in the box with the most texture (Shi-Tomasi corners), best first
export function cornersIn(
  I: Img,
  W: number,
  H: number,
  box: { cx: number; cy: number; w: number; h: number },
  grid = 15,
  max = 90,
) {
  const cand: { x: number; y: number; e: number }[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = box.cx - box.w * 0.42 + ((gx + 0.5) / grid) * box.w * 0.84;
      const y = box.cy - box.h * 0.42 + ((gy + 0.5) / grid) * box.h * 0.84;
      if (x < WIN + 2 || y < WIN + 2 || x > W - WIN - 3 || y > H - WIN - 3) continue;
      // the structure tensor over a 7x7 window; its smaller eigenvalue is the corner strength
      let sxx = 0;
      let sxy = 0;
      let syy = 0;
      const xi = Math.round(x);
      const yi = Math.round(y);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const i = (yi + dy) * W + xi + dx;
          const ix = (I.d[i + 1] - I.d[i - 1]) * 0.5;
          const iy = (I.d[i + W] - I.d[i - W]) * 0.5;
          sxx += ix * ix;
          sxy += ix * iy;
          syy += iy * iy;
        }
      }
      const e = (sxx + syy - Math.sqrt((sxx - syy) * (sxx - syy) + 4 * sxy * sxy)) / 2 / 49;
      if (e > 0.3) cand.push({ x, y, e });
    }
  }
  cand.sort((a, b) => b.e - a.e);
  return cand.slice(0, max);
}

// normalised cross-correlation of the 7x7 patches around (ax, ay) in A and (bx, by) in B: 1 = alike
export function patchNcc(A: Img, ax: number, ay: number, B: Img, bx: number, by: number) {
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let n = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const a = samp(A, ax + dx, ay + dy);
      const b = samp(B, bx + dx, by + dy);
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
      n++;
    }
  }
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : 0;
}

// the box's look: an n x n sampling, zero-mean and unit length, so dot() of two is their correlation
export function boxVec(img: Img, cx: number, cy: number, w: number, h: number, n = 20) {
  const v = new Float32Array(n * n);
  let s = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const val = samp(img, cx - w / 2 + ((i + 0.5) / n) * w, cy - h / 2 + ((j + 0.5) / n) * h);
      v[j * n + i] = val;
      s += val;
    }
  }
  const m = s / (n * n);
  let ss = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= m;
    ss += v[i] * v[i];
  }
  const nrm = Math.sqrt(ss) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= nrm;
  return v;
}

export function dot(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
