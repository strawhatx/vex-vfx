import { GUIDES, guideBySlug } from '@/domain/promo/content/guides';
import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A PromoReel guide';
export const generateStaticParams = () => GUIDES.map(g => ({ slug: g.slug }));

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug)!;
  return ogCard({ title: g.title.split(':')[0].split(' (')[0], kicker: 'Guide' });
}
