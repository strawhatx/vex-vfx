// How the film's layers are stacked, bottom to top: cutouts, the user's effect clips, filters,
// video effects and text, in any order the user puts them (text behind a cutout of the person, a
// filter over everything, or under the text). What's drawn on the video itself (effects on objects,
// impacts) is always at the bottom, with the video; within a layer, a higher row is in front.
export type StackLayer = 'cutouts' | 'clips' | 'filter' | 'screen' | 'text';

export const DEFAULT_STACK: readonly StackLayer[] = ['cutouts', 'clips', 'filter', 'screen', 'text'];

const LAYERS = new Set<string>(DEFAULT_STACK);

// the stack with `layer` moved one place up (in front, +1) or down (behind, -1)
export function moveLayer(stack: readonly StackLayer[], layer: StackLayer, by: 1 | -1): StackLayer[] {
  const out = stack.slice();
  const k = out.indexOf(layer),
    j = k + by;
  if (k < 0 || j < 0 || j >= out.length) return out;
  [out[k], out[j]] = [out[j], out[k]];
  return out;
}

// a stack from data (a saved film): its layers in the order it has them, each once, then any it
// leaves out, in their default order (none: the default)
export function fitStack(raw: unknown): StackLayer[] {
  const got = Array.isArray(raw) ? raw.filter((l): l is StackLayer => LAYERS.has(l)) : [];
  const out = [...new Set(got)];
  return [...out, ...DEFAULT_STACK.filter(l => !out.includes(l))];
}
