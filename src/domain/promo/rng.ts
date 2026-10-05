// A small seeded random generator (mulberry32): the same seed gives the same numbers, so a plan or a
// frame made from it is the same every time.

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a stable 0..1 number for an integer key (grain, glitch slices): no state, any order
export function hash01(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
