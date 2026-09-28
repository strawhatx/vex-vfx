// Which pixels of a person segmenter's mask (every person in the frame) are the person being
// followed. Each pixel goes to whoever's skeleton (from the pose model) is nearest, so two people
// touching are split between them, and only the pieces that are this person's are kept: a piece
// with one of their joints on it, one that mostly overlaps where they were last frame, or (on the
// first frame, with no pose) the piece that was tapped.
import { POSE, type Person, type Pt } from '@/domain/tracking/bodyParts';
import { fillHoles, type Bounds } from './maskOps';

// the skeleton: pairs of pose landmarks
const BONES: [number, number][] = [
  [POSE.nose, POSE.shoulderL],
  [POSE.nose, POSE.shoulderR],
  [POSE.earL, POSE.earR],
  [POSE.shoulderL, POSE.shoulderR],
  [POSE.shoulderL, 13],
  [13, POSE.wrist[0]],
  [POSE.shoulderR, 14],
  [14, POSE.wrist[1]],
  [POSE.wrist[0], POSE.index[0]],
  [POSE.wrist[1], POSE.index[1]],
  [POSE.shoulderL, POSE.hipL],
  [POSE.shoulderR, POSE.hipR],
  [POSE.hipL, POSE.hipR],
  [POSE.hipL, 25],
  [25, POSE.ankle[0]],
  [POSE.hipR, 26],
  [26, POSE.ankle[1]],
  [POSE.ankle[0], POSE.toe[0]],
  [POSE.ankle[1], POSE.toe[1]],
];
// the joints a piece of the outline can be recognised by: nose, shoulders, elbows, wrists, hips,
// knees, ankles
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
// a pixel further than this from the person's skeleton (in torso lengths) isn't theirs
const REACH = 1;
// a piece still counts as them if this share of it was them last frame
const STAY = 0.3;

export type Follow = {
  who: Person | null; // the person, if the pose model found them this frame
  others: Person[]; // everyone else it found
  prev?: Uint8Array | null; // their outline last frame (W x H, 1 = them)
  seed?: Pt; // where they were tapped
};

// the person's pixels of `seg` (W x H, 1 = some person), written to `mask` with holes filled; queue:
// scratch space of W * H. Null if none of it is theirs.
export function personPixels(
  seg: Uint8Array,
  W: number,
  H: number,
  f: Follow,
  mask: Uint8Array,
  queue: Int32Array,
): Bounds | null {
  // 1 = could be them
  mask.fill(0);
  const reach = f.who ? f.who.size * REACH : Infinity;
  for (let i = 0; i < seg.length; i++) {
    if (!seg[i]) continue;
    if (f.who) {
      const x = i % W,
        y = (i / W) | 0,
        d = skeletonDist(f.who, x, y);
      if (d > reach || f.others.some(o => skeletonDist(o, x, y) < d)) continue;
    }
    mask[i] = 1;
  }

  // the pixels a piece is recognised as them by: their joints, or the tap
  const marks = new Set<number>();
  const mark = (p: Pt, r: number) => {
    const px = Math.round(p.x),
      py = Math.round(p.y);
    for (let y = py - r; y <= py + r; y++)
      for (let x = px - r; x <= px + r; x++) if (x >= 0 && y >= 0 && x < W && y < H) marks.add(y * W + x);
  };
  if (f.who) for (const j of JOINTS) mark(f.who.points[j], 1);
  if (f.seed) mark(f.seed, 2);

  // each piece: 2 = looked at, then 3 = kept or 0 = dropped
  let bx0 = W,
    by0 = H,
    bx1 = -1,
    by1 = -1;
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== 1) continue;
    let qh = 0,
      qt = 0,
      marked = false,
      stayed = 0;
    mask[s] = 2;
    queue[qt++] = s;
    while (qh < qt) {
      const i = queue[qh++],
        px = i % W,
        py = (i / W) | 0;
      if (marks.has(i)) marked = true;
      if (f.prev?.[i]) stayed++;
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? px + 1 : d === 1 ? px - 1 : px;
        const ny = d === 2 ? py + 1 : d === 3 ? py - 1 : py;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (mask[j] !== 1) continue;
        mask[j] = 2;
        queue[qt++] = j;
      }
    }
    const keep = marked || stayed >= qt * STAY;
    for (let k = 0; k < qt; k++) {
      const i = queue[k];
      mask[i] = keep ? 3 : 0;
      if (!keep) continue;
      const px = i % W,
        py = (i / W) | 0;
      if (px < bx0) bx0 = px;
      if (px > bx1) bx1 = px;
      if (py < by0) by0 = py;
      if (py > by1) by1 = py;
    }
  }
  if (bx1 < 0) return null;
  const b = { bx0, by0, bx1, by1 };
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) mask[y * W + x] = mask[y * W + x] ? 1 : 0;
  fillHoles(mask, W, H, b, queue);
  return b;
}

// how far (x, y) is from the nearest bone of p's skeleton
function skeletonDist(p: Person, x: number, y: number) {
  let best = Infinity;
  for (const [a, b] of BONES) best = Math.min(best, segDist(p.points[a], p.points[b], x, y));
  return best;
}

function segDist(a: Pt, b: Pt, x: number, y: number) {
  const vx = b.x - a.x,
    vy = b.y - a.y,
    len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2)) : 0;
  return Math.hypot(a.x + t * vx - x, a.y + t * vy - y);
}
