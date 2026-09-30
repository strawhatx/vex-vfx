// Operations on an object mask (W x H, 1 = object), used to turn a segmenter's output into one
// clean outline and compare it with the last.

export type Bounds = { bx0: number; by0: number; bx1: number; by1: number };

// the connected piece of `seg` nearest (x, y) (within 6 px), written to `mask` with its holes
// filled; queue: scratch space of W * H. Null if there's no object near the point.
export function pieceAt(
  seg: Uint8Array,
  W: number,
  H: number,
  x: number,
  y: number,
  mask: Uint8Array,
  queue: Int32Array,
): Bounds | null {
  // start from the object pixel nearest the point
  let si = -1;
  for (let r = 0; r <= 6 && si < 0; r++) {
    for (let dy = -r; dy <= r && si < 0; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && seg[yy * W + xx]) {
          si = yy * W + xx;
          break;
        }
      }
    }
  }
  if (si < 0) return null;

  // flood fill from there
  mask.fill(0);
  let qh = 0;
  let qt = 0;
  let bx0 = si % W;
  let bx1 = bx0;
  let by0 = (si / W) | 0;
  let by1 = by0;
  mask[si] = 1;
  queue[qt++] = si;
  while (qh < qt) {
    const i = queue[qh++];
    const px = i % W;
    const py = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? px + 1 : d === 1 ? px - 1 : px;
      const ny = d === 2 ? py + 1 : d === 3 ? py - 1 : py;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (mask[j] || !seg[j]) continue;
      mask[j] = 1;
      queue[qt++] = j;
      if (nx < bx0) bx0 = nx;
      if (nx > bx1) bx1 = nx;
      if (ny < by0) by0 = ny;
      if (ny > by1) by1 = ny;
    }
  }
  const b = { bx0, by0, bx1, by1 };
  fillHoles(mask, W, H, b, queue);
  return b;
}

// fills holes inside the outline: whatever the outside can't reach becomes object
export function fillHoles(mask: Uint8Array, W: number, H: number, b: Bounds, queue: Int32Array) {
  const x0 = Math.max(0, b.bx0 - 1);
  const x1 = Math.min(W - 1, b.bx1 + 1);
  const y0 = Math.max(0, b.by0 - 1);
  const y1 = Math.min(H - 1, b.by1 + 1);
  let qh = 0;
  let qt = 0;
  // 2 = outside
  const push = (x: number, y: number) => {
    const j = y * W + x;
    if (!mask[j]) {
      mask[j] = 2;
      queue[qt++] = j;
    }
  };
  for (let x = x0; x <= x1; x++) {
    push(x, y0);
    push(x, y1);
  }
  for (let y = y0; y <= y1; y++) {
    push(x0, y);
    push(x1, y);
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > x0) push(x - 1, y);
    if (x < x1) push(x + 1, y);
    if (y > y0) push(x, y - 1);
    if (y < y1) push(x, y + 1);
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const j = y * W + x;
      mask[j] = mask[j] === 2 ? 0 : 1;
    }
  }
}

export function maskArea(mask: Uint8Array, W: number, b: Bounds) {
  let a = 0;
  for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) a += mask[y * W + x];
  return a;
}

// the share of `mask` (within b) that `prev`, moved by (dx, dy), also covers
export function overlapShare(
  mask: Uint8Array,
  prev: Uint8Array,
  W: number,
  H: number,
  b: Bounds,
  dx: number,
  dy: number,
) {
  let both = 0;
  let n = 0;
  for (let y = b.by0; y <= b.by1; y++) {
    for (let x = b.bx0; x <= b.bx1; x++) {
      if (!mask[y * W + x]) continue;
      n++;
      const px = x - dx;
      const py = y - dy;
      if (px >= 0 && py >= 0 && px < W && py < H && prev[py * W + px]) both++;
    }
  }
  return n ? both / n : 0;
}

// the point deepest inside the outline (farthest from its edge, by a two-pass distance transform)
export function deepestPoint(mask: Uint8Array, W: number, b: Bounds) {
  const bw = b.bx1 - b.bx0 + 1;
  const bh = b.by1 - b.by0 + 1;
  const d = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (!mask[(b.by0 + y) * W + b.bx0 + x]) {
        d[i] = 0;
        continue;
      }
      d[i] = Math.min(x ? d[i - 1] + 1 : 1, y ? d[i - bw] + 1 : 1);
    }
  }
  let best = 0;
  let bi = 0;
  for (let y = bh - 1; y >= 0; y--) {
    for (let x = bw - 1; x >= 0; x--) {
      const i = y * bw + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], x < bw - 1 ? d[i + 1] + 1 : 1, y < bh - 1 ? d[i + bw] + 1 : 1);
      if (d[i] > best) {
        best = d[i];
        bi = i;
      }
    }
  }
  return { x: b.bx0 + (bi % bw), y: b.by0 + ((bi / bw) | 0) };
}
