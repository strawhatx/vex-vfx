// The eases the engine moves with, through GSAP. "reel" is the site's one curve
// (cubic-bezier(0.22, 1, 0.36, 1)), shared by the marketing pages and the videos.
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);
CustomEase.create('reel', '0.22,1,0.36,1');

export { gsap };

// a 0..1 → 0..1 function for an ease name
export const easeFn = (name: string): ((u: number) => number) => {
  const f = gsap.parseEase(name);
  return u => f(Math.max(0, Math.min(1, u)));
};

export const reel = easeFn('reel');
export const inOut = easeFn('power2.inOut');
export const backOut = easeFn('back.out(1.8)');
export const expoOut = easeFn('expo.out');
export const quadIn = easeFn('power2.in');
export const quadOut = easeFn('power2.out');
