export type Effect = 'fire' | 'lightning' | 'aura' | 'sparks';

export const PALETTES = [
  { name: 'Ember', c: ['#fff6d8', '#ffc640', '#ff6a1a', '#b3200e'] },
  { name: 'Blue', c: ['#f0fbff', '#7fe0ff', '#2f7bff', '#2a1a9e'] },
  { name: 'Toxic', c: ['#f4ffe0', '#b6ff4a', '#35c43a', '#0d5a2a'] },
  { name: 'Void', c: ['#fbeaff', '#d98bff', '#8a2be2', '#3a0a6b'] },
] as const;

export const DEFAULT_PAL: Record<Effect, number> = { fire: 0, lightning: 1, aura: 3, sparks: 0 };

export interface FxSettings { effect: Effect; pal: number; size: number; intensity: number }
