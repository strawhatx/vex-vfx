// Screenshots dropped somewhere else on the site (the premiere's screen) waiting for /create to take
// them. In memory only, for the length of this visit.
let pending: File[] | null = null;
let pendingRecipe: string | null = null;

export function handOff(files: File[], recipe?: string) {
  pending = files;
  pendingRecipe = recipe ?? null;
}

export function takeHandOff(): { files: File[]; recipe: string | null } | null {
  if (!pending) return null;
  const out = { files: pending, recipe: pendingRecipe };
  pending = null;
  pendingRecipe = null;
  return out;
}
