// Glitch styles: the video's own pixels broken up, on the tracked object (the rest of the frame
// stays clean) or over the whole frame. They come in bursts, more often with more intensity.
//   - rgb: the red, green and blue layers slide apart
//   - slices: horizontal strips jump sideways
//   - blocks: chunks turn into big pixels, some shifted or tinted
//   - vhs: an old tape: scanlines, color bleed, noise and a rolling tracking band
//   - chaos: all of the above at once
export type GlitchStyle = 'rgb' | 'slices' | 'blocks' | 'vhs' | 'chaos';

export const GLITCH_STYLES: { id: GlitchStyle; label: string }[] = [
  { id: 'rgb', label: 'RGB split' },
  { id: 'slices', label: 'Slices' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'vhs', label: 'VHS' },
  { id: 'chaos', label: 'Chaos' },
];
