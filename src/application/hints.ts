// The hint for what to do next, from what's going on in the editor.
import type { Editor } from './editor';

export interface HintState {
  ready: boolean; // a clip is loaded
  scanning: boolean; // its frames are still being read
  camera: boolean; // recording from the camera
  exporting: boolean;
  paused: boolean;
  choosing: boolean; // picking which body part to follow
  aiming: boolean; // the next tap sets a laser's target
  adding: 'effect' | 'impact' | null; // what the next tap adds
  selected: number | null; // the selected clip
}

// what it needs to know about the clips
export type HintQueries = Pick<Editor, 'trackCount' | 'name' | 'inRange' | 'hasShapeAt' | 'lostAt'>;

// idx: the frame shown (-1: none)
export function hintFor(s: HintState, ed: HintQueries, idx: number): string {
  if (s.camera) return 'Recording from the camera.';
  if (!s.ready || s.scanning || s.exporting) return '';
  if (!ed.trackCount) return 'Tap what the effect should follow.';
  if (s.choosing) return 'Pick which part it should follow.';
  if (s.aiming) return 'Tap where the laser should hit.';
  if (s.adding)
    return s.adding === 'impact' ? 'Tap what the impact should hit.' : 'Tap what the effect should follow.';
  const sel = s.selected;
  if (sel !== null && s.paused) {
    const name = ed.name(sel);
    if (idx < 0) return '';
    if (!ed.inRange(sel, idx)) return `Outside ${name}’s effect. Drag its ends to cover this.`;
    if (!ed.hasShapeAt(sel, idx)) return `${name} isn’t found here. Tap it to fix.`;
    return `Wrong? Tap ${name} to fix this frame.`;
  }
  if (idx >= 0 && ed.lostAt(idx)) return 'Searching for the object…';
  return '';
}
