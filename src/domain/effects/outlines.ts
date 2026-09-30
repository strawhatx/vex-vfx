// Outline styles: a line traced round the tracked object's silhouette, in the palette's colors.
//   - neon: a bright core with a wide glow, flickering slightly like a tube
//   - double: a line hugging the object and a second one a little way out
//   - glitch: the line split into colors that jump apart now and then
//   - pulse: a glowing line with rings rippling out from it
//   - sketch: a few rough lines that wobble frame to frame, like a hand-drawn animation
export type OutlineStyle = 'neon' | 'double' | 'glitch' | 'pulse' | 'sketch';

export const OUTLINE_STYLES: { id: OutlineStyle; label: string }[] = [
  { id: 'neon', label: 'Neon' },
  { id: 'double', label: 'Double' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'sketch', label: 'Sketch' },
];
