// Where things sit in the frame for each format, in pixels. `u` is 1% of the frame's short side, so
// sizes written in u look the same at any resolution.
import type { Format } from '@/domain/video/plan';

export interface Geometry {
  W: number;
  H: number;
  min: number;
  u: number;
  format: Format;
  tall: boolean;
  wide: boolean;
  // the centre of the content area (above the subtitle bar)
  cx: number;
  cy: number;
  // how wide content may be
  maxW: number;
  // big headline text (kinetic type, numbers scale from this)
  title: number;
  // the subtitle bar: its centre line and text size
  captionY: number;
  caption: number;
}

export function geometry(W: number, H: number, format: Format): Geometry {
  const min = Math.min(W, H);
  const u = min / 100;
  const tall = format === '9:16',
    wide = format === '16:9';
  return {
    W,
    H,
    min,
    u,
    format,
    tall,
    wide,
    cx: W / 2,
    // tall: above the platform's bottom buttons and the caption; others: a little above centre
    cy: tall ? H * 0.43 : H * 0.45,
    maxW: tall ? W * 0.84 : wide ? W * 0.72 : W * 0.82,
    title: tall ? u * 10.5 : wide ? u * 10 : u * 9,
    // tall: clear of TikTok/Reels' bottom bar
    captionY: tall ? H * 0.78 : H * 0.87,
    caption: tall ? u * 4.6 : u * 4.4,
  };
}

// the frame size for a format at a given short side
export function frameSize(format: Format, short = 1080): [number, number] {
  const long = Math.round((short * 16) / 9);
  return format === '9:16' ? [short, long] : format === '16:9' ? [long, short] : [short, short];
}
