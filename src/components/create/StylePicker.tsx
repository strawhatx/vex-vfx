'use client';

// Step 1: the aesthetics as a gallery of looping previews. A radio group: arrow keys move between
// styles; the chosen one plays, the others play when hovered.
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import type { Recipe } from '@/domain/video/recipe';

export function StylePicker({
  recipes,
  value,
  onPick,
}: {
  recipes: readonly Recipe[];
  value: string;
  onPick: (slug: string) => void;
}) {
  return (
    <fieldset className="styles">
      <legend className="visually-hidden">Pick a style</legend>
      {recipes.map(r => (
        <label key={r.slug} className={`style-tile${value === r.slug ? ' on' : ''}`} data-preview>
          <input
            type="radio"
            name="style"
            value={r.slug}
            checked={value === r.slug}
            onChange={() => onPick(r.slug)}
            className="visually-hidden"
          />
          <span className="style-media">
            <EnginePlayer
              recipe={r.slug}
              format="9:16"
              mode={value === r.slug ? 'loop' : 'hover'}
              maxShort={320}
              label={`${r.name} preview`}
            />
          </span>
          <strong>{r.name}</strong>
          <span className="label">{r.page.mood}</span>
        </label>
      ))}
    </fieldset>
  );
}
