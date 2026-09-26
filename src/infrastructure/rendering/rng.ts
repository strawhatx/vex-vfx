// Seeded randomness. Each video frame gets its own generator, derived from the project seed
// and the frame number, so a frame's random draws never depend on how we got to it.
export function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (seed: number, frame: number) =>
  mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(frame + 1, 0xc2b2ae35));

export type Rng = () => number;
