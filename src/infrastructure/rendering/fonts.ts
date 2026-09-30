// The fonts text is drawn in: each font's CSS family, handed in by whoever loaded them (the app
// self-hosts them), with plain fallbacks until then.
import type { FontId } from '@/domain/effects/text';

export type Fonts = Record<FontId, string>;

export const FALLBACK_FONTS: Fonts = {
  anton: 'Impact, sans-serif',
  bebas: 'Impact, sans-serif',
  bangers: 'Impact, sans-serif',
  inter: 'system-ui, sans-serif',
};

// a canvas font string: px pixels high (Inter heavy; the others only come in one weight)
export const fontFor = (fonts: Fonts, id: FontId, px: number) =>
  `${id === 'inter' ? '800 ' : ''}${Math.max(1, Math.round(px))}px ${fonts[id]}`;

// overshoots a little, then settles: for things popping in (0..1 in, 0..1 out)
export const backOut = (q: number) => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
