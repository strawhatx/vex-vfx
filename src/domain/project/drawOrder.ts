// The order every frame is drawn in, bottom to top, whatever the tracks look like (see
// docs/timeline-rules.md, rule 3). A track's rows only decide what's in front within one step; the
// steps themselves never change places. The footage comes first, with what's drawn on it (effects on
// objects set behind, impacts); then, in this order:
//   - background: filters on the whole clip or just its background
//   - behind: text and effect clips set behind the subject
//   - subjects: what's cut out of the clip, with the filters on the whole clip or just the subject
//   - front: effects on objects set in front, then text and the particles of video effects
//   - clips: the user's effect clips, like overlay tracks
//   - screen: shake, glitch, flash and the like, on the finished image
//   - transition: a transition's flash or blur, last of all
export type DrawStep = 'background' | 'behind' | 'subjects' | 'front' | 'clips' | 'screen' | 'transition';

export const DRAW_ORDER: readonly DrawStep[] = [
  'background',
  'behind',
  'subjects',
  'front',
  'clips',
  'screen',
  'transition',
];

// whether something over the footage (text, an effect clip, an effect on an object) is drawn in front
// of what's cut out of the clip, or behind it
export type Place = 'front' | 'behind';

export const placeOf = (c: { place?: Place }): Place => c.place ?? 'front';
