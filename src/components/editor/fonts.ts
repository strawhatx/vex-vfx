// The self-hosted fonts text effects are drawn in (declared in app/layout.tsx as CSS variables):
// their CSS families, once the browser has them loaded, for drawing on the canvas.
import type { FontId } from '@/domain/effects/text';

const FONT_VARS: Record<FontId, string> = {
  anton: '--font-anton',
  bebas: '--font-bebas',
  bangers: '--font-bangers',
  inter: '--font-inter',
};

// the CSS family to show a font in, e.g. on a font's tile
export const fontVar = (id: FontId) => `var(${FONT_VARS[id]})`;

export async function loadFonts(): Promise<Record<FontId, string>> {
  const css = getComputedStyle(document.documentElement);
  const ids = Object.keys(FONT_VARS) as FontId[];
  const families = ids.map(id => css.getPropertyValue(FONT_VARS[id]).trim() || 'sans-serif');
  await Promise.all(families.map(f => document.fonts.load(`40px ${f}`).catch(() => [])));
  return Object.fromEntries(ids.map((id, k) => [id, families[k]])) as Record<FontId, string>;
}
