import type { GlitchStyle } from './glitches';
import type { OutlineStyle } from './outlines';
import type { FontId, TextStyle } from './text';
import type { WaterStyle } from './water';

export type Effect =
  'fire' | 'lightning' | 'aura' | 'water' | 'sparks' | 'laser' | 'outline' | 'glitch' | 'text';

export const PALETTES = [
  { name: 'Ember', c: ['#fff6d8', '#ffc640', '#ff6a1a', '#b3200e'] },
  { name: 'Blue', c: ['#f0fbff', '#7fe0ff', '#2f7bff', '#2a1a9e'] },
  { name: 'Toxic', c: ['#f4ffe0', '#b6ff4a', '#35c43a', '#0d5a2a'] },
  { name: 'Void', c: ['#fbeaff', '#d98bff', '#8a2be2', '#3a0a6b'] },
  { name: 'Red', c: ['#fff0f0', '#ff6b6b', '#ff1f3d', '#8a0019'] },
  { name: 'Prism', c: ['#ffd6f6', '#62d8ff', '#a24bff', '#ff8a1f'] },
] as const;

export const palIndex = (name: (typeof PALETTES)[number]['name']) => PALETTES.findIndex(p => p.name === name);

export const DEFAULT_PAL: Record<Effect, number> = {
  fire: 0,
  lightning: 1,
  aura: 3,
  water: palIndex('Blue'),
  sparks: 0,
  laser: 4,
  outline: palIndex('Prism'),
  glitch: 0, // uses the video's own colors
  text: 0,
};

// volume: how loud the clip's sound effect is, 0 (off) to 1.5
export interface FxSettings {
  effect: Effect;
  pal: number;
  size: number;
  intensity: number;
  volume: number;
  outline: OutlineStyle; // how an outline is drawn
  glitch: GlitchStyle; // how a glitch breaks the picture up
  text: string; // a text effect's words
  textStyle: TextStyle;
  font: FontId;
  water: WaterStyle; // how a water effect looks
}
