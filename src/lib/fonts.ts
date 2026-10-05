// The site's three faces, self-hosted by next/font: Big Shoulders (display, marquee-like),
// Inter Tight (body) and JetBrains Mono (credits and labels).
import { Big_Shoulders, Inter_Tight, JetBrains_Mono } from 'next/font/google';

export const display = Big_Shoulders({
  variable: '--font-display',
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  // Next has no metrics to size-match a fallback for this face; a condensed system face is closest
  adjustFontFallback: false,
  fallback: ['Arial Narrow', 'Impact', 'sans-serif'],
});

// only the display face (the headline, the LCP element) is preloaded; the others swap in
export const body = Inter_Tight({
  variable: '--font-body',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

export const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  preload: false,
});
