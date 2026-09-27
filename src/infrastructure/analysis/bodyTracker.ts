// Follows one body part of one person through the frames: the pose model finds the people in each
// frame, the tapped person is followed from frame to frame by where their body is, and the part's
// shape comes from the hand or face model when it has one (otherwise from the pose's own points).
// Every frame is found fresh rather than followed from the last, so a fast-moving hand stays covered.
import {
  faceFor,
  handFor,
  partOutlines,
  partPoints,
  person,
  personAt,
  samePerson,
  shapeFrom,
  sideFor,
  type BodyPart,
  type Person,
} from '@/domain/tracking/bodyParts';
import type { Selection, Shape } from '@/domain/tracking/types';
import type { Landmarks } from './mediapipe';

export interface BodyModels {
  poses: Landmarks;
  hands: Landmarks | null;
  faces: Landmarks | null;
}

// which models a part needs besides the pose
export const modelsFor = (part: BodyPart) => ({
  hands: part === 'handL' || part === 'handR',
  faces: part === 'head' || part === 'eyes',
});

export class BodyPartTracker {
  private who: Person | null = null;
  private side: 0 | 1 = 0;
  private mask: Uint8Array;

  // image: the canvas holding the frame being looked at
  constructor(
    private W: number,
    private H: number,
    private part: BodyPart,
    private models: BodyModels,
    private image: OffscreenCanvas,
  ) {
    this.mask = new Uint8Array(W * H);
  }

  // the frame the part was picked on: find the tapped person and which side the part is on
  start(sel: Selection): Shape | null {
    const who = personAt(this.people(), sel);
    if (!who) return null;
    this.who = who;
    if (this.part !== 'head' && this.part !== 'eyes' && this.part !== 'body')
      this.side = sideFor(who, this.part);
    return this.shape(who);
  }

  // the next frame: the same person if they're still there
  step(): Shape | null {
    if (!this.who) return null;
    const who = samePerson(this.people(), this.who);
    if (!who) return null;
    this.who = who;
    return this.shape(who);
  }

  private people() {
    return this.models.poses(this.image).map(person);
  }

  private shape(p: Person): Shape | null {
    const hand = this.models.hands ? handFor(this.models.hands(this.image), p, this.side) : null;
    const face = this.models.faces ? faceFor(this.models.faces(this.image), p) : null;
    const shape = shapeFrom(partOutlines(this.part, p, this.side, hand, face), this.W, this.H, this.mask);
    return shape && { ...shape, points: partPoints(this.part, p, this.side, hand, face) };
  }
}
