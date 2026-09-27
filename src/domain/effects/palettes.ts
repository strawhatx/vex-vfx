export type Effect = 'fire' | 'lightning' | 'aura' | 'sparks' | 'laser';

export const PALETTES = [
  { name: 'Ember', c: ['#fff6d8', '#ffc640', '#ff6a1a', '#b3200e'] },
  { name: 'Blue', c: ['#f0fbff', '#7fe0ff', '#2f7bff', '#2a1a9e'] },
  { name: 'Toxic', c: ['#f4ffe0', '#b6ff4a', '#35c43a', '#0d5a2a'] },
  { name: 'Void', c: ['#fbeaff', '#d98bff', '#8a2be2', '#3a0a6b'] },
  { name: 'Red', c: ['#fff0f0', '#ff6b6b', '#ff1f3d', '#8a0019'] },
] as const;

export const DEFAULT_PAL: Record<Effect, number> = { fire: 0, lightning: 1, aura: 3, sparks: 0, laser: 4 };

// volume: how loud the clip's sound effect is, 0 (off) to 1.5
export interface FxSettings {
  effect: Effect;
  pal: number;
  size: number;
  intensity: number;
  volume: number;
}
