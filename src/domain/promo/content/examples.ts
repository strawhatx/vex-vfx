// Example videos made with PromoReel itself, shown on /examples and the aesthetic and use-case pages,
// each with a transcript on the page and VideoObject structured data.
import type { Aspect } from '../plan';

export interface Example {
  slug: string;
  title: string;
  recipe: string;
  aspect: Aspect;
  product: string;
  description: string;
  // the words on screen, in order
  transcript: string;
  seconds: number;
  uploadDate: string;
}

export const EXAMPLES: Example[] = [
  {
    slug: 'orbit-clean-apple',
    title: 'Orbit launch video in Clean Apple style',
    recipe: 'clean-apple',
    aspect: '16:9',
    product: 'Orbit',
    description:
      'A calm 16:9 launch video for Orbit, a changelog tool, made from four screenshots in the Clean Apple style: a floating device, slow zooms and soft dissolves.',
    transcript:
      'Meet Orbit. Changelogs that write themselves. Drafted from your commits. See what people read. Everyone hears about it. Orbit. orbit.dev. Try it free. Made with PromoReel.',
    seconds: 15.8,
    uploadDate: '2026-10-05',
  },
  {
    slug: 'orbit-y2k-chrome',
    title: 'Orbit TikTok promo in Y2K Chrome style',
    recipe: 'y2k-chrome',
    aspect: '9:16',
    product: 'Orbit',
    description:
      'A fast 9:16 promo for TikTok and Reels in the Y2K Chrome style: chrome devices, flash cuts and slammed words.',
    transcript:
      'Orbit is here. Changelogs that write themselves. Ship notes in one click. Watch the reads roll in. Your team, in the loop. Orbit. orbit.dev. Try it free. Made with PromoReel.',
    seconds: 13,
    uploadDate: '2026-10-05',
  },
  {
    slug: 'orbit-brutalist',
    title: 'Orbit launch video in Brutalist style',
    recipe: 'brutalist',
    aspect: '9:16',
    product: 'Orbit',
    description:
      'A loud 9:16 launch video in the Brutalist style: huge capitals, hard cuts and an orange accent.',
    transcript:
      'Introducing Orbit. Changelogs that write themselves. No more release notes at midnight. Know what landed. Built for makers. Orbit. orbit.dev. Try it free. Made with PromoReel.',
    seconds: 12.6,
    uploadDate: '2026-10-05',
  },
];

export const exampleBySlug = (slug: string) => EXAMPLES.find(e => e.slug === slug);
export const examplesFor = (recipe: string) => EXAMPLES.filter(e => e.recipe === recipe);
