// Example videos made with PromoReel itself (from the hand-written example plans), shown on
// /examples and the style and use-case pages, each with its transcript on the page and VideoObject
// structured data. The transcript and length come from the plan, so they always match the video.
import { exampleById } from '../examples';
import { totalSeconds, type Format, type Plan } from '../plan';
import { displayUrl } from '../product';
import type { Scene } from '../scenes';

export interface Example {
  slug: string;
  title: string;
  recipe: string;
  aspect: Format;
  product: string;
  description: string;
  // the words on screen, in order
  transcript: string;
  seconds: number;
  uploadDate: string;
}

const clean = (s: string) => s.replace(/\*/g, '').trim();
const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

// every word on screen, scene by scene: the scene's own text, then its subtitle, then the end card
export function transcriptOf(plan: Plan): string {
  const words: string[] = [];
  const say = (s: string) => s.trim() && words.push(end(clean(s)));
  const num = (n: { value: number | null }, pre: string, suf: string) =>
    n.value == null
      ? ''
      : `${pre}${pre.length > 1 ? ' ' : ''}${n.value.toLocaleString('en-US')}${suf.length > 1 ? ' ' : ''}${suf}`;
  for (const s of plan.scenes as Scene[]) {
    if (s.type === 'logo-reveal') [s.name, s.tagline].forEach(say);
    if (s.type === 'kinetic-type') say(s.text);
    if (s.type === 'stat-counter') say(`${num(s.value, s.prefix, s.suffix)} ${s.label}`);
    if (s.type === 'stat-ring') [`${s.percent.value ?? ''}% ${s.label}`, s.badge].forEach(say);
    if (s.type === 'card-stack') {
      s.cards.forEach(c => say(c.subtitle ? `${c.title}: ${c.subtitle}` : c.title));
      say(`${num(s.stat, s.statPrefix, s.statSuffix)} ${s.statLabel}`);
    }
    if (s.type === 'ambient-wall') say(s.title);
    if (plan.captions) say(s.caption);
  }
  [plan.product.name, displayUrl(plan.product.url), 'Made with PromoReel'].forEach(say);
  return words.join(' ');
}

function make(slug: string, example: string, recipe: string, title: string, description: string): Example {
  const plan = exampleById(example)!.plan;
  return {
    slug,
    title,
    recipe,
    aspect: plan.format,
    product: plan.product.name,
    description,
    transcript: transcriptOf(plan),
    seconds: Math.round(totalSeconds(plan) * 10) / 10,
    uploadDate: '2026-10-06',
  };
}

export const EXAMPLES: Example[] = [
  make(
    'orbit-launch-clean-soft',
    'orbit-launch',
    'clean-soft',
    'Orbit launch video in the Clean Soft style',
    'A calm 15-second vertical launch video for Orbit, a changelog app: a logo reveal, a card timeline, a counter and a call to action, in soft light.',
  ),
  make(
    'orbit-feature-clean-soft',
    'orbit-feature',
    'clean-soft',
    'Orbit feature explainer in the Clean Soft style',
    'A 30-second widescreen feature explainer: an ambient wall of documents gaining checkmarks, a progress ring, a four-step card timeline and a counter.',
  ),
  make(
    'orbit-launch-y2k-chrome',
    'orbit-launch',
    'y2k-chrome',
    'Orbit TikTok promo in the Y2K Chrome style',
    'The same Orbit launch video restyled for TikTok and Reels: glowing type on a night-sky grid, bouncy counters and flash cuts.',
  ),
  make(
    'orbit-stats-brutalist',
    'orbit-stats',
    'brutalist',
    'Orbit stats ad in the Brutalist style',
    'A square 15-second stats ad: huge capitals, a counter and a ring in hazard orange, hard cuts and paper grain.',
  ),
];

export const exampleBySlug = (slug: string) => EXAMPLES.find(e => e.slug === slug);
export const examplesFor = (recipe: string) => EXAMPLES.filter(e => e.recipe === recipe);
