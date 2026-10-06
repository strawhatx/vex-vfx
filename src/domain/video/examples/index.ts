// Hand-written example plans: what the engine is tested with before AI writes plans, the demos on
// the marketing pages, and the starting points in /create. Each one goes through checkPlan.
import { checkPlan } from '../check';
import type { Plan } from '../plan';
import orbitFeature from './orbit-feature.json';
import orbitLaunch from './orbit-launch.json';
import orbitStats from './orbit-stats.json';
import starter from './starter.json';

export interface Example {
  id: string;
  title: string;
  describe: string;
  plan: Plan;
}

const make = (id: string, title: string, describe: string, raw: unknown): Example => {
  const c = checkPlan(raw);
  if (!c.ok) throw new Error(`example ${id}: ${c.reason}`);
  return { id, title, describe, plan: c.plan };
};

export const EXAMPLES: readonly Example[] = [
  make('orbit-launch', 'Launch video', 'Orbit, a changelog app: 15 seconds, vertical.', orbitLaunch),
  make('orbit-feature', 'Feature explainer', 'A new Orbit feature: 30 seconds, wide.', orbitFeature),
  make('orbit-stats', 'Stats ad', 'Orbit’s results: 15 seconds, square.', orbitStats),
  make('starter', 'Start from scratch', 'Your product, with the numbers left for you to fill in.', starter),
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
export const exampleById = (id: string) => EXAMPLES.find(e => e.id === id);
// a fresh copy to edit
export const examplePlan = (id: string): Plan => structuredClone((exampleById(id) ?? DEFAULT_EXAMPLE).plan);
