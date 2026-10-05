// Where things sit in the frame, by aspect and layout, as fractions of the frame turned into pixels.
import type { Aspect } from '@/domain/promo/plan';
import type { Layout } from '@/domain/promo/recipe';

export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface Geometry {
  W: number;
  H: number;
  min: number;
  // the area a screenshot is fitted into
  screen: Box;
  // captions: where the block of text centres, how wide it may be, its size, and alignment
  caption: { x: number; y: number; maxW: number; size: number; align: 'center' | 'left' };
  // the hook and outro titles
  title: { size: number; maxW: number };
}

export function geometry(W: number, H: number, aspect: Aspect, layout: Layout): Geometry {
  const min = Math.min(W, H);
  const tall = aspect === '9:16';
  const screen: Box = tall
    ? { cx: W * 0.5, cy: H * 0.4, w: W * 0.74, h: H * 0.56 }
    : { cx: W * 0.5, cy: H * 0.41, w: W * 0.62, h: H * 0.7 };
  if (layout === 'full-bleed') {
    screen.w *= 1.14;
    screen.h *= 1.06;
  }
  if (layout === 'grid' && !tall) screen.cx = W * 0.6;
  const left = layout === 'grid';
  const caption = tall
    ? {
        x: left ? W * 0.09 : W * 0.5,
        y: H * 0.8,
        maxW: W * 0.84,
        size: W * 0.068,
        align: left ? ('left' as const) : ('center' as const),
      }
    : {
        x: left ? W * 0.07 : W * 0.5,
        y: left ? H * 0.5 : H * 0.875,
        maxW: left ? W * 0.3 : W * 0.78,
        size: H * (left ? 0.07 : 0.062),
        align: left ? ('left' as const) : ('center' as const),
      };
  return {
    W,
    H,
    min,
    screen,
    caption,
    title: tall ? { size: W * 0.115, maxW: W * 0.84 } : { size: H * 0.13, maxW: W * 0.76 },
  };
}

// the w×h rect of an iw×ih image fitted inside box w×h
export function fit(iw: number, ih: number, w: number, h: number) {
  const k = Math.min(w / iw, h / ih);
  return { w: iw * k, h: ih * k };
}
