// Edge refinement for cutouts (the "fine matte"): the object's outline comes from the segmenter at
// analysis size, so scaled up to the picture it's cut from, its edge is soft and blocky and sits a
// little off the object's real edge. A colour guided filter (He, Sun & Tang) redraws that edge from
// the picture itself: within each small window the matte becomes a straight-line function of the
// pixels' colours, so it follows the object's real edge — a sleeve, fingers, strands of hair —
// while staying as it was where the picture is flat.

// rgba: the picture (w x h); alpha: the rough matte there, 0..1. Returns the refined matte, 0..1.
// r: the window's radius (px); eps: how much a window's colours must vary before the edge follows
// them (larger keeps it smoother). The filter leaves the object a little see-through just inside
// its edge, so what comes out is firmed up: mostly-in is in, mostly-out is out, and only what's
// truly in between (a strand of hair, a blurred hand) stays part see-through.
export function refineMatte(
  rgba: Uint8ClampedArray,
  alpha: Float32Array,
  w: number,
  h: number,
  r = 4,
  eps = 1e-3,
): Float32Array {
  const n = w * h;
  const R = new Float32Array(n),
    G = new Float32Array(n),
    B = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    R[k] = rgba[k * 4] / 255;
    G[k] = rgba[k * 4 + 1] / 255;
    B[k] = rgba[k * 4 + 2] / 255;
  }
  const mul = (a: Float32Array, b: Float32Array) => {
    const o = new Float32Array(n);
    for (let k = 0; k < n; k++) o[k] = a[k] * b[k];
    return o;
  };
  const box = (a: Float32Array) => boxMean(a, w, h, r);

  const mR = box(R),
    mG = box(G),
    mB = box(B),
    mP = box(alpha);
  const mRP = box(mul(R, alpha)),
    mGP = box(mul(G, alpha)),
    mBP = box(mul(B, alpha));
  const vRR = box(mul(R, R)),
    vRG = box(mul(R, G)),
    vRB = box(mul(R, B)),
    vGG = box(mul(G, G)),
    vGB = box(mul(G, B)),
    vBB = box(mul(B, B));

  // per window: the matte as a·colour + b
  const aR = new Float32Array(n),
    aG = new Float32Array(n),
    aB = new Float32Array(n),
    b = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    // the colours' covariance in the window (plus eps), and their covariance with the matte
    const rr = vRR[k] - mR[k] * mR[k] + eps,
      rg = vRG[k] - mR[k] * mG[k],
      rb = vRB[k] - mR[k] * mB[k],
      gg = vGG[k] - mG[k] * mG[k] + eps,
      gb = vGB[k] - mG[k] * mB[k],
      bb = vBB[k] - mB[k] * mB[k] + eps;
    const cR = mRP[k] - mR[k] * mP[k],
      cG = mGP[k] - mG[k] * mP[k],
      cB = mBP[k] - mB[k] * mP[k];
    // a = covariance⁻¹ · c (a symmetric 3 x 3)
    const i00 = gg * bb - gb * gb,
      i01 = rb * gb - rg * bb,
      i02 = rg * gb - rb * gg,
      i11 = rr * bb - rb * rb,
      i12 = rb * rg - rr * gb,
      i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const ar = (i00 * cR + i01 * cG + i02 * cB) / det,
      ag = (i01 * cR + i11 * cG + i12 * cB) / det,
      ab = (i02 * cR + i12 * cG + i22 * cB) / det;
    aR[k] = ar;
    aG[k] = ag;
    aB[k] = ab;
    b[k] = mP[k] - ar * mR[k] - ag * mG[k] - ab * mB[k];
  }
  // each pixel takes the average of the windows it's in
  const fR = box(aR),
    fG = box(aG),
    fB = box(aB),
    fb = box(b);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = firm(fR[k] * R[k] + fG[k] * G[k] + fB[k] * B[k] + fb[k]);
  return out;
}

// the refined matte firmed up: below LO out, above HI in, eased between
const LO = 0.1,
  HI = 0.75;
function firm(q: number) {
  const u = q <= LO ? 0 : q >= HI ? 1 : (q - LO) / (HI - LO);
  return u * u * (3 - 2 * u);
}

// the mean over a (2r+1) x (2r+1) window round each pixel (shrunk at the edges), in O(n)
function boxMean(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h),
    out = new Float32Array(w * h);
  // along rows
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) sum += a[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r),
        hi = Math.min(w - 1, x + r);
      tmp[row + x] = sum / (hi - lo + 1);
      if (x + r + 1 < w) sum += a[row + x + r + 1];
      if (x - r >= 0) sum -= a[row + x - r];
    }
  }
  // down columns
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) sum += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r),
        hi = Math.min(h - 1, y + r);
      out[y * w + x] = sum / (hi - lo + 1);
      if (y + r + 1 < h) sum += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) sum -= tmp[(y - r) * w + x];
    }
  }
  return out;
}
