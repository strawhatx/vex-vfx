// The demo the marketing pages play: "Orbit", a made-up changelog app, in four screenshots. Plans
// come from the same rule-based director the tool uses, with captions written for Orbit.
import { autoPlan } from '@/domain/promo/autoPlan';
import type { Aspect, Plan } from '@/domain/promo/plan';
import type { Product } from '@/domain/promo/product';
import type { Recipe } from '@/domain/promo/recipe';
import { validatePlan } from '@/domain/promo/validate';
import { ShotStore, type ShotImage } from '@/infrastructure/promo/shots';

export const DEMO_PRODUCT: Product = {
  name: 'Orbit',
  tagline: 'Changelogs that write themselves',
  url: 'orbit.dev',
};
export const DEMO_SHOTS = [
  '/demo/orbit-1.svg',
  '/demo/orbit-2.svg',
  '/demo/orbit-3.svg',
  '/demo/orbit-4.svg',
];
const CAPTIONS = [
  'Changelogs that write themselves',
  'Drafted from your commits',
  'See what people read',
  'Everyone hears about it',
];

let images: Promise<ShotImage[]> | null = null;
const store = typeof window === 'undefined' ? null : new ShotStore();

// the four screenshots, decoded once per page
export function demoImages(): Promise<ShotImage[]> {
  if (!store) return Promise.resolve([]);
  images ??= Promise.all(DEMO_SHOTS.map((u, i) => store.addUrl(u, `orbit-${i + 1}`))).then(list =>
    list.map(x => store.get(x.shot.id)!),
  );
  return images;
}

// a plan for the demo; `single` shows one screenshot only (the signature moment)
export function demoPlan(recipe: Recipe, aspect: Aspect, single = false): Plan {
  const shots = single ? 1 : DEMO_SHOTS.length;
  const raw = autoPlan({ recipe, shots, product: DEMO_PRODUCT, aspect, seed: 3 });
  raw.hook.text = 'Meet Orbit';
  raw.scenes.forEach((s, i) => {
    if (s.caption) s.caption.text = CAPTIONS[single ? i % 3 : s.shot] ?? s.caption.text;
    if (single) s.zoom = i === 1 ? { x: 0.5, y: 0.33, scale: 1.7 } : { x: 0.5, y: 0.5, scale: 1 };
  });
  const v = validatePlan(raw, { recipe, shots, product: DEMO_PRODUCT, aspect });
  return v.ok ? v.plan : raw;
}
