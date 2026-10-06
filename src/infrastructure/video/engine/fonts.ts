// The fonts the engine draws with: each font id's CSS family (the page loads them with next/font and
// hands the families in), its weight, and a fallback until then.
import type { FontId } from '@/domain/video/recipe';

export type FontFamilies = Partial<Record<FontId, string>>;

const WEIGHT: Record<FontId, number> = {
  inter: 600,
  'inter-tight': 700,
  syne: 800,
  'archivo-black': 400,
  'space-mono': 700,
  vt323: 400,
  'ibm-plex-mono': 500,
};

const FALLBACK: Record<FontId, string> = {
  inter: 'system-ui, sans-serif',
  'inter-tight': 'system-ui, sans-serif',
  syne: 'system-ui, sans-serif',
  'archivo-black': 'Impact, sans-serif',
  'space-mono': 'ui-monospace, monospace',
  vt323: 'ui-monospace, monospace',
  'ibm-plex-mono': 'ui-monospace, monospace',
};

// a canvas font string
export const fontString = (fonts: FontFamilies, id: FontId, px: number, weight?: number) =>
  `${weight ?? WEIGHT[id]} ${Math.max(1, Math.round(px))}px ${fonts[id] ?? FALLBACK[id]}`;
