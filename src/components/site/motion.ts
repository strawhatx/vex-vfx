// GSAP for the marketing pages, set up once: ScrollTrigger, SplitText, and the site's "reel" ease.
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
if (!CustomEase.get('reel')) CustomEase.create('reel', '0.22,1,0.36,1');
gsap.defaults({ ease: 'reel', duration: 0.8 });

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export { gsap, ScrollTrigger, SplitText };
