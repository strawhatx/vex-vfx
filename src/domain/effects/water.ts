// Water styles, over the whole frame or around the tracked object:
//   - rain: streaks falling at a few depths, the picture a little darker and cooler, splashes and
//     ripples on the ground, and (on an object) drops bouncing off its top
//   - underwater: the picture wobbling and tinted blue-green, light shafts and moving patches from
//     the surface, bubbles rising (from the object too, when there is one) and specks drifting
// A splash is an impact: see impacts.ts.
export type WaterStyle = 'rain' | 'underwater';

export const WATER_STYLES: { id: WaterStyle; label: string }[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'underwater', label: 'Underwater' },
];
