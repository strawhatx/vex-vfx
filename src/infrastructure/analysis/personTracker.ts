// Follows the whole person tapped through the frames. Each frame the person segmenter outlines the
// people in it, looking only round where the followed one is (enlarged, so someone small in the
// shot still comes out in detail), and the pose model tells which of them it is (see
// personMask.ts). The outline is found fresh every frame rather than moved along from the last, so
// a moving camera doesn't throw it off.
import { person, personAt, samePerson, type Person } from '@/domain/tracking/bodyParts';
import { encodeRle, type Selection, type Shape } from '@/domain/tracking/types';
import type { Bounds } from './maskOps';
import type { Landmarks, PersonSegmenter, Region } from './mediapipe';
import { personPixels } from './personMask';

// frames the last outline is kept for (marked lost) while the person can't be found
const HOLD = 3;
// room left round the person's joints when looking for them, in torso lengths
const ROOM = 0.6;
// a box drawn round a person picks them if it's at least this share of their size (otherwise it's
// round something smaller, like what they're holding)
const BOX_SHARE = 0.35;

export interface PersonModels {
  poses: Landmarks;
  people: PersonSegmenter;
}

export class PersonTracker {
  private who: Person | null = null;
  // the person as last seen by the pose model, to know them again by
  private seen: Person | null = null;
  private mask: Uint8Array;
  private prev: Uint8Array;
  private queue: Int32Array;
  private had: Bounds | null = null;
  private last: Shape | null = null;
  private misses = 0;

  // image: the canvas holding the frame being looked at
  constructor(
    private W: number,
    private H: number,
    private models: PersonModels,
    private image: OffscreenCanvas,
  ) {
    this.mask = new Uint8Array(W * H);
    this.prev = new Uint8Array(W * H);
    this.queue = new Int32Array(W * H);
  }

  // the frame they were tapped on. With `only` set it gives up (null) unless the tap is right on a
  // person, and a box drawn round what was picked (its size) is round the whole of them
  start(sel: Selection, only?: { focus: { w: number; h: number } | null }): Shape | null {
    const people = this.people();
    this.who = this.seen = personAt(people, sel);
    if (only && !this.who) return null;
    const shape = this.find(people, sel);
    if (!only || !shape) return shape;
    const on = this.mask[Math.round(sel.y) * this.W + Math.round(sel.x)] === 1;
    const f = only.focus;
    return on && (!f || f.w * f.h >= BOX_SHARE * shape.w * shape.h) ? shape : null;
  }

  // the next frame
  step(): Shape | null {
    const people = this.people();
    this.who = this.seen ? samePerson(people, this.seen) : null;
    return this.find(people);
  }

  private people() {
    return this.models.poses(this.image).map(person);
  }

  private find(people: Person[], seed?: Selection): Shape | null {
    const { W, H, mask } = this;
    const seg = this.models.people.segment(this.image, this.region());
    const b = personPixels(
      seg,
      W,
      H,
      { who: this.who, others: people.filter(p => p !== this.who), prev: this.had && this.prev, seed },
      mask,
      this.queue,
    );
    if (!b) {
      this.misses++;
      return this.last && this.misses <= HOLD ? { ...this.last, lost: true } : null;
    }
    this.misses = 0;
    // lost by the pose model but still outlined: whoever is in the outline now is them
    const inOutline = (p: Person) => {
      const x = Math.round(p.center.x),
        y = Math.round(p.center.y);
      return x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
    };
    const who = this.who ?? people.find(inOutline) ?? null;
    if (who) this.who = this.seen = who;
    this.prev.set(mask);
    this.had = b;
    const rle = encodeRle(mask, W, b.bx0, b.by0, b.bx1, b.by1);
    return (this.last = {
      id: 1,
      cx: (b.bx0 + b.bx1) / 2,
      cy: (b.by0 + b.by1) / 2,
      w: b.bx1 - b.bx0 + 1,
      h: b.by1 - b.by0 + 1,
      mask: rle,
    });
  }

  // where to look: round their joints and where they were last frame, as a square (what the
  // segmenter works in); the whole frame if neither is known
  private region(): Region | undefined {
    const { W, H, who, had } = this;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const take = (ax: number, ay: number, bx: number, by: number) => {
      x0 = Math.min(x0, ax);
      y0 = Math.min(y0, ay);
      x1 = Math.max(x1, bx);
      y1 = Math.max(y1, by);
    };
    if (who) {
      const r = who.size * ROOM;
      for (const p of who.points) take(p.x - r, p.y - r, p.x + r, p.y + r);
    }
    if (had) {
      const r = 0.1 * Math.max(had.bx1 - had.bx0, had.by1 - had.by0);
      take(had.bx0 - r, had.by0 - r, had.bx1 + r, had.by1 + r);
    }
    if (x1 < x0) return undefined;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(W, x1);
    y1 = Math.min(H, y1);
    const side = Math.max(x1 - x0, y1 - y0);
    if (side >= Math.max(W, H)) return undefined;
    // squared up about its middle, slid back inside the frame
    const sx = Math.max(0, Math.min(W - side, (x0 + x1 - side) / 2)),
      sy = Math.max(0, Math.min(H - side, (y0 + y1 - side) / 2));
    return { x0: sx, y0: sy, x1: sx + side, y1: sy + side };
  }
}
