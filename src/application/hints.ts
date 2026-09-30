// The hint for what to do next, from what's going on in the editor.

export interface HintState {
  ready: boolean; // a clip is loaded
  scanning: boolean; // its frames are still being read
  camera: boolean; // recording from the camera
  exporting: boolean;
  paused: boolean;
  choosing: boolean; // picking where a new effect comes from
  aiming: boolean; // the next tap sets a laser's target
  adding: 'effect' | 'impact' | 'explosion' | 'shockwave' | 'word' | 'water' | 'cutout' | null; // what the next tap adds
  selected: number | null; // the selected clip
}

// what it needs to know about the clips (idx: the frame shown, of the video playing)
export interface HintQueries {
  trackCount: number;
  name(id: number): string;
  inRange(id: number, idx: number): boolean;
  hasShapeAt(id: number, idx: number): boolean;
  lostAt(idx: number): boolean;
  pinned(id: number): boolean;
  kind(id: number): 'effect' | 'impact' | 'cutout' | null;
  cutoutShowing(id: number, idx: number): boolean;
}

// idx: the frame shown (-1: none)
export function hintFor(s: HintState, ed: HintQueries, idx: number): string {
  if (s.camera) return 'Recording from the camera.';
  if (!s.ready || s.scanning || s.exporting) return '';
  if (s.choosing) return 'Pick where it should come from.';
  if (s.aiming) return 'Tap where the laser should hit.';
  if (s.adding === 'explosion') return 'Tap where the explosion should go off.';
  if (s.adding === 'shockwave') return 'Tap where the shockwave should start.';
  if (s.adding === 'impact') return 'Tap where the impact should hit.';
  if (s.adding === 'word') return 'Tap where the word should pop up.';
  if (s.adding === 'water') return 'Tap where the water should splash.';
  if (s.adding === 'cutout') return 'Drag a box round the object to cut out (or tap it).';
  if (s.adding) return 'Tap what the effect should follow.';
  if (!ed.trackCount) return 'Tap what the effect should follow.';
  const sel = s.selected;
  if (sel !== null && s.paused) {
    const name = ed.name(sel);
    if (idx < 0) return '';
    if (ed.pinned(sel)) return `Tap the preview to move ${name}.`;
    if (ed.kind(sel) === 'cutout') {
      if (ed.cutoutShowing(sel, idx)) return `Drag to move ${name}.`;
      return `${name} isn’t showing here.`;
    }
    if (!ed.inRange(sel, idx)) return `Outside ${name}’s effect. Drag its ends to cover this.`;
    if (!ed.hasShapeAt(sel, idx)) return `${name} isn’t found here. Tap it to fix.`;
    return `Wrong? Tap ${name} to fix this frame.`;
  }
  if (idx >= 0 && ed.lostAt(idx)) return 'Searching for the object…';
  return '';
}
