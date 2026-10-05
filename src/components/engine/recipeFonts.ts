// The fonts the videos are drawn in, self-hosted by next/font and not preloaded: they download only
// when a video is drawn (loadRecipeFonts asks for them), so they never slow the first paint.
import { Archivo_Black, IBM_Plex_Mono, Inter, Inter_Tight, Space_Mono, Syne, VT323 } from 'next/font/google';
import type { FontId, Recipe } from '@/domain/promo/recipe';
import type { FontFamilies } from '@/infrastructure/promo/engine/fonts';

const inter = Inter({ subsets: ['latin'], weight: ['500', '600', '700'], preload: false, display: 'swap' });
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '700'],
  preload: false,
  display: 'swap',
});
const syne = Syne({ subsets: ['latin'], weight: ['500', '800'], preload: false, display: 'swap' });
const archivoBlack = Archivo_Black({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], preload: false, display: 'swap' });
const vt323 = VT323({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  preload: false,
  display: 'swap',
});

export const FONT_FAMILIES: Record<FontId, string> = {
  inter: inter.style.fontFamily,
  'inter-tight': interTight.style.fontFamily,
  syne: syne.style.fontFamily,
  'archivo-black': archivoBlack.style.fontFamily,
  'space-mono': spaceMono.style.fontFamily,
  vt323: vt323.style.fontFamily,
  'ibm-plex-mono': plexMono.style.fontFamily,
};

// a class that declares every recipe font on the page (they still download only when used)
export const RECIPE_FONT_CLASSES = [inter, interTight, syne, archivoBlack, spaceMono, vt323, plexMono]
  .map(f => f.className)
  .join(' ');

// waits for a recipe's fonts (with a timeout, so a slow network never blocks the video)
export async function loadRecipeFonts(recipes: readonly Recipe[]): Promise<FontFamilies> {
  if (typeof document === 'undefined' || !document.fonts) return FONT_FAMILIES;
  const wanted = new Set(recipes.flatMap(r => [r.fonts.display, r.fonts.body]));
  const loads = [...wanted].flatMap(id => [
    document.fonts.load(`400 40px ${FONT_FAMILIES[id]}`),
    document.fonts.load(`700 40px ${FONT_FAMILIES[id]}`),
  ]);
  await Promise.race([Promise.allSettled(loads), new Promise(r => setTimeout(r, 2500))]);
  return FONT_FAMILIES;
}
