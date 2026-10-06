// A plan is the whole video as data: format, style, brand colour, target length, the product, and
// the scenes in order. The AI director (Phase 2) or a person writes it; check.ts checks it before
// anything plays; the engine draws it.
import type { Scene } from './scenes';

export type Format = '9:16' | '1:1' | '16:9';
export const FORMATS: readonly Format[] = ['9:16', '1:1', '16:9'];
export const FORMAT_LABELS: Record<Format, string> = {
  '9:16': 'TikTok, Reels, Shorts',
  '1:1': 'X, LinkedIn, Instagram',
  '16:9': 'YouTube, Product Hunt, website',
};

export type Length = 15 | 30 | 60;
export const LENGTHS: readonly Length[] = [15, 30, 60];

export interface Plan {
  v: 2;
  format: Format;
  aesthetic: string;
  // the user's brand colour (#rrggbb), or null for the style's own
  brandColor: string | null;
  // the target length in seconds; the scenes add up to it within 10%
  length: Length;
  product: { name: string; url: string };
  // show the subtitle bar
  captions: boolean;
  scenes: Scene[];
}

export const LIMITS = { scenes: [1, 14], caption: 90 } as const;

// every video ends on the engine's own card (name, URL, "Made with PromoReel"), this long
export const END_CARD_SECONDS = 2.5;
// a transition overlaps the cut by half of this on each side
export const TRANSITION_SECONDS = 0.5;

export const scenesSeconds = (p: Plan) => p.scenes.reduce((s, x) => s + x.sec, 0);
export const totalSeconds = (p: Plan) => scenesSeconds(p) + END_CARD_SECONDS;
