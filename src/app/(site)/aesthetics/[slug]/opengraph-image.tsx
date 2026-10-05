import { RECIPES, recipeBySlug } from '@/domain/promo/recipes';
import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A PromoReel style';
export const generateStaticParams = () => RECIPES.map(r => ({ slug: r.slug }));

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const r = recipeBySlug((await params).slug)!;
  return ogCard({
    title: `${r.name} product video`,
    kicker: 'Style · now showing',
    colors: { bg: r.palette.bg, fg: r.palette.fg, accent: r.palette.accent },
  });
}
