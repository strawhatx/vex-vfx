// Impact styles: a hit is a moment, not a stretch. Each style mixes the same ingredients in
// different amounts: a flash at the hit point, shockwave rings, a burst of sparks thrown the way
// the object was moving, and a camera jolt (shake plus a quick zoom into the hit).

export type ImpactStyle = 'punch' | 'slam' | 'blast' | 'anime';

export interface ImpactLook {
  label: string;
  duration: number; // seconds until everything has faded
  flash: number; // size of the flash at the hit, in object sizes (0 = none)
  screenFlash: number; // 0..1 whole-frame flash
  rings: number; // shockwave rings
  sparks: number; // how many sparks
  spread: number; // radians either side of the direction of travel (Math.PI = all round)
  speed: number; // spark speed, in object sizes per second
  gravity: number; // how fast sparks fall, in object sizes per second²
  shake: number; // camera shake, as a fraction of the frame's width
  zoom: number; // zoom punch into the hit (0.08 = 8%)
  palette: boolean; // colored by the effect's palette instead of white-hot
}

export const IMPACT_STYLES: ImpactStyle[] = ['punch', 'slam', 'blast', 'anime'];

export const IMPACTS: Record<ImpactStyle, ImpactLook> = {
  punch: {
    label: 'Punch',
    duration: 0.45,
    flash: 1.1,
    screenFlash: 0,
    rings: 1,
    sparks: 26,
    spread: 0.7,
    speed: 5,
    gravity: 2,
    shake: 0.012,
    zoom: 0.05,
    palette: false,
  },
  slam: {
    label: 'Slam',
    duration: 0.7,
    flash: 1.4,
    screenFlash: 0.15,
    rings: 2,
    sparks: 40,
    spread: 1.3,
    speed: 4,
    gravity: 7,
    shake: 0.03,
    zoom: 0.07,
    palette: false,
  },
  blast: {
    label: 'Energy blast',
    duration: 0.8,
    flash: 2.2,
    screenFlash: 0.3,
    rings: 3,
    sparks: 56,
    spread: Math.PI,
    speed: 6,
    gravity: 0,
    shake: 0.02,
    zoom: 0.08,
    palette: true,
  },
  anime: {
    label: 'Anime hit',
    duration: 0.55,
    flash: 1.8,
    screenFlash: 0.55,
    rings: 2,
    sparks: 34,
    spread: 0.45,
    speed: 8,
    gravity: 0,
    shake: 0.018,
    zoom: 0.1,
    palette: true,
  },
};
