// Impact styles: a hit is a moment, not a stretch. Every impact goes off at a spot tapped in the
// scene and stays there as the camera moves; none follows an object. They come in three families:
//   - hits: a flash at the point of impact, shockwave rings, a burst of sparks and a camera jolt
//     (shake plus a quick zoom into the hit)
//   - explosions: a fireball, smoke, debris and a ground shockwave
//   - shockwaves: rings of particles racing outwards, bending the picture as they pass
//   - words: a comic POW, BOOM or K.O. popping up on a spiky burst
//   - water: a splash where something hits the surface

import { palIndex } from './palettes';

export type HitStyle = 'punch' | 'slam' | 'blast' | 'anime';
export type ExplosionStyle = 'fireball' | 'grenade' | 'bigboom';
export type ShockwaveStyle = 'ring' | 'ground' | 'pulse' | 'nova';
export type WordStyle = 'pow' | 'boom' | 'ko' | 'bam';
export type SplashStyle = 'splash' | 'bigsplash';
export type ImpactStyle = HitStyle | ExplosionStyle | ShockwaveStyle | WordStyle | SplashStyle;
export type ImpactFamily = 'hit' | 'explosion' | 'shockwave' | 'word' | 'water';

export interface ExplosionLook {
  smoke: number; // 0..1: how much smoke billows up and lingers
  debris: number; // how many chunks are thrown out
  mushroom: boolean; // the smoke rises in a column and spreads into a cap
}

// a shockwave: rings of particles racing out from the spot
export interface WaveLook {
  rings: number; // how many, one after another
  gap: number; // seconds between rings
  reach: number; // how far each ring gets, in impact sizes
  particles: number; // particles in each ring
  flatten: number; // 1 = a circle facing the camera; less = squashed flat along the ground
  dust: boolean; // kicked-up dust rather than glowing energy
  distort: number; // 0..1: how much it bends the picture as it passes
}

// a nova: hundreds of particles bursting out, each curling as it flies and leaving a glowing
// trail, so together they make a ring of wispy energy, layered in the palette's colors from the
// middle out, with flames of its deepest color round the edge
export interface NovaLook {
  particles: number;
  reach: number; // how far the ring gets, in impact sizes
  curl: number; // 0..1: how much the particles swirl and wander as they fly
  distort: number; // 0..1: how much it bends the picture as it passes
}

// a splash: a crown of water rising and falling back, droplets thrown out in arcs, ripples
// spreading on the surface and a puff of mist
export interface SplashLook {
  drops: number;
  height: number; // how high the crown and the drops go, in impact sizes
}

// a comic word: it pops up on a spiky burst, tilted, then swells and fades
export interface WordLook {
  text: string;
  tilt: number; // radians
  spikes: number; // points on the burst behind it
}

export interface ImpactLook {
  label: string;
  family: ImpactFamily;
  duration: number; // seconds until everything has faded
  size: number; // as a fraction of the frame's width
  flash: number; // size of the flash at the hit, in impact sizes (0 = none)
  screenFlash: number; // 0..1 whole-frame flash
  rings: number; // plain shockwave rings
  sparks: number; // how many sparks
  speed: number; // spark speed, in impact sizes per second
  gravity: number; // how fast sparks fall, in impact sizes per second²
  shake: number; // camera shake, as a fraction of the frame's width
  zoom: number; // zoom punch into the hit (0.08 = 8%)
  palette: boolean; // colored by the effect's palette instead of white-hot
  pal?: number; // the palette a new one starts with (otherwise the last one used)
  explosion?: ExplosionLook;
  wave?: WaveLook;
  nova?: NovaLook;
  word?: WordLook;
  splash?: SplashLook;
}

export const FAMILY_STYLES: Record<ImpactFamily, ImpactStyle[]> = {
  hit: ['punch', 'slam', 'blast', 'anime'],
  explosion: ['fireball', 'grenade', 'bigboom'],
  shockwave: ['ring', 'ground', 'pulse', 'nova'],
  word: ['pow', 'boom', 'ko', 'bam'],
  water: ['splash', 'bigsplash'],
};
export const IMPACT_STYLES = FAMILY_STYLES.hit;

// (a style this version doesn't know, e.g. from code mid-reload, counts as a hit)
export const familyOf = (style: ImpactStyle): ImpactFamily => IMPACTS[style]?.family ?? 'hit';

// the styles a clip of this style can switch to: those of its own family
export const stylesLike = (style: ImpactStyle): ImpactStyle[] => FAMILY_STYLES[familyOf(style)];

// the ground shockwave an explosion sends out
const blastRing = (reach: number): Pick<ImpactLook, 'rings' | 'wave'> => ({
  rings: 0,
  wave: { rings: 1, gap: 0, reach, particles: 70, flatten: 0.4, dust: true, distort: 0.8 },
});

// a comic word popping up where it was tapped, with a jolt and a few sparks
const word = (
  text: string,
  duration: number,
  size: number,
  tilt: number,
  spikes: number,
  shake: number,
): ImpactLook => ({
  label: text,
  family: 'word',
  duration,
  size,
  flash: 0.6,
  screenFlash: 0.12,
  rings: 1,
  sparks: 14,
  speed: 4,
  gravity: 2,
  shake,
  zoom: 0.05,
  palette: true,
  pal: palIndex('Ember'),
  word: { text, tilt, spikes },
});

// water splashing up where it was tapped, in the palette's colors
const splash = (
  label: string,
  duration: number,
  size: number,
  drops: number,
  height: number,
  shake: number,
): ImpactLook => ({
  label,
  family: 'water',
  duration,
  size,
  flash: 0,
  screenFlash: 0,
  rings: 0,
  sparks: 0,
  speed: 0,
  gravity: 0,
  shake,
  zoom: 0.02,
  palette: true,
  pal: palIndex('Blue'),
  splash: { drops, height },
});

export const IMPACTS: Record<ImpactStyle, ImpactLook> = {
  // ---------- hits (size: the burst at the point of impact) ----------
  punch: {
    label: 'Punch',
    family: 'hit',
    duration: 0.45,
    size: 0.05,
    flash: 1.1,
    screenFlash: 0,
    rings: 1,
    sparks: 26,
    speed: 5,
    gravity: 2,
    shake: 0.012,
    zoom: 0.05,
    palette: false,
  },
  slam: {
    label: 'Slam',
    family: 'hit',
    duration: 0.7,
    size: 0.06,
    flash: 1.4,
    screenFlash: 0.15,
    rings: 2,
    sparks: 40,
    speed: 4,
    gravity: 7,
    shake: 0.03,
    zoom: 0.07,
    palette: false,
  },
  blast: {
    label: 'Energy blast',
    family: 'hit',
    duration: 0.8,
    size: 0.07,
    flash: 2.2,
    screenFlash: 0.3,
    rings: 3,
    sparks: 56,
    speed: 6,
    gravity: 0,
    shake: 0.02,
    zoom: 0.08,
    palette: true,
  },
  anime: {
    label: 'Anime hit',
    family: 'hit',
    duration: 0.55,
    size: 0.06,
    flash: 1.8,
    screenFlash: 0.55,
    rings: 2,
    sparks: 34,
    speed: 8,
    gravity: 0,
    shake: 0.018,
    zoom: 0.1,
    palette: true,
  },

  // ---------- explosions (size: the fireball's radius) ----------
  fireball: {
    label: 'Fireball',
    family: 'explosion',
    duration: 1.6,
    size: 0.11,
    flash: 1.3,
    screenFlash: 0.3,
    sparks: 30,
    speed: 3,
    gravity: 3,
    shake: 0.035,
    zoom: 0.05,
    palette: true,
    explosion: { smoke: 0.7, debris: 14, mushroom: false },
    ...blastRing(3.2),
  },
  grenade: {
    label: 'Grenade',
    family: 'explosion',
    duration: 1.1,
    size: 0.07,
    flash: 1.1,
    screenFlash: 0.2,
    sparks: 44,
    speed: 4.5,
    gravity: 5,
    shake: 0.045,
    zoom: 0.07,
    palette: true,
    explosion: { smoke: 0.5, debris: 34, mushroom: false },
    ...blastRing(4),
  },
  bigboom: {
    label: 'Big boom',
    family: 'explosion',
    duration: 3.2,
    size: 0.17,
    flash: 1.6,
    screenFlash: 0.55,
    sparks: 40,
    speed: 3,
    gravity: 2,
    shake: 0.06,
    zoom: 0.04,
    palette: true,
    explosion: { smoke: 1, debris: 40, mushroom: true },
    ...blastRing(3.5),
  },

  // ---------- shockwaves (size: the burst at the middle; the rings reach much further) ----------
  ring: {
    label: 'Ring',
    family: 'shockwave',
    duration: 0.9,
    size: 0.06,
    flash: 0.8,
    screenFlash: 0.1,
    rings: 0,
    sparks: 0,
    speed: 0,
    gravity: 0,
    shake: 0.015,
    zoom: 0.03,
    palette: true,
    wave: { rings: 1, gap: 0, reach: 5, particles: 90, flatten: 1, dust: false, distort: 0.7 },
  },
  ground: {
    label: 'Ground',
    family: 'shockwave',
    duration: 1.2,
    size: 0.06,
    flash: 0.5,
    screenFlash: 0,
    rings: 0,
    sparks: 20,
    speed: 3,
    gravity: 6,
    shake: 0.03,
    zoom: 0.02,
    palette: false,
    wave: { rings: 1, gap: 0, reach: 6, particles: 80, flatten: 0.3, dust: true, distort: 0.5 },
  },
  pulse: {
    label: 'Energy pulse',
    family: 'shockwave',
    duration: 1.4,
    size: 0.06,
    flash: 1.4,
    screenFlash: 0.25,
    rings: 0,
    sparks: 0,
    speed: 0,
    gravity: 0,
    shake: 0.02,
    zoom: 0.05,
    palette: true,
    wave: { rings: 3, gap: 0.18, reach: 5.5, particles: 70, flatten: 1, dust: false, distort: 1 },
  },
  nova: {
    label: 'Nova',
    family: 'shockwave',
    duration: 1.8,
    size: 0.07,
    flash: 1.2,
    screenFlash: 0.2,
    rings: 0,
    sparks: 0,
    speed: 0,
    gravity: 0,
    shake: 0.025,
    zoom: 0.05,
    palette: true,
    pal: palIndex('Prism'),
    nova: { particles: 480, reach: 4, curl: 0.8, distort: 0.8 },
  },

  // ---------- words (size: the letters' height) ----------
  pow: word('POW!', 0.9, 0.09, -0.16, 12, 0.025),
  boom: word('BOOM!', 1.1, 0.11, 0.1, 16, 0.045),
  ko: word('K.O.', 1.2, 0.1, -0.08, 14, 0.03),
  bam: word('BAM!', 0.85, 0.085, 0.18, 10, 0.025),

  // ---------- water (size: the crown's radius) ----------
  splash: splash('Splash', 1.2, 0.06, 60, 3, 0.012),
  bigsplash: splash('Big splash', 1.8, 0.1, 110, 4, 0.03),
};
