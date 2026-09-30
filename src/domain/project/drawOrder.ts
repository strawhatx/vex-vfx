// The order every frame is drawn in, bottom to top, whatever the tracks look like (see
// docs/timeline-rules.md, rule 3). A track's rows only decide what's in front within one step; the
// steps themselves never change places. The footage comes first, with what's drawn on it (effects on
// objects, impacts); then, in this order:
//   - cutouts: the objects seen through their masks
//   - filter: color looks, over the footage and its cutouts together (the whole clip)
//   - text: text and the particles of video effects, in front of the subject
//   - clips: the user's effect clips, like overlay tracks
//   - screen: shake, glitch, flash and the like, on the finished image
//   - transition: a transition's flash or blur, last of all
export type DrawStep = 'cutouts' | 'filter' | 'text' | 'clips' | 'screen' | 'transition';

export const DRAW_ORDER: readonly DrawStep[] = ['cutouts', 'filter', 'text', 'clips', 'screen', 'transition'];
