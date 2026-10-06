// The demos the marketing pages play: the hand-written example plans (Orbit, a made-up changelog
// app), restyled into any aesthetic and format.
import { restyle } from '@/domain/video/edit';
import { examplePlan } from '@/domain/video/examples';
import type { Format, Plan } from '@/domain/video/plan';
import { DEFAULT_RECIPE, recipeBySlug } from '@/domain/video/recipes';

export function demoPlan(example: string, recipe: string, format?: Format): Plan {
  const plan = restyle(examplePlan(example), recipeBySlug(recipe) ?? DEFAULT_RECIPE);
  // the demo keeps each style's own colours
  plan.brandColor = null;
  if (format) plan.format = format;
  return plan;
}
