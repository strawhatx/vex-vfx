import { USE_CASES, findUseCase } from '@/domain/promo/content/useCases';
import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Launch video guide';
export const generateStaticParams = () => USE_CASES.map(u => ({ useCase: u.slug }));

export default async function Image({ params }: { params: Promise<{ useCase: string }> }) {
  const u = findUseCase((await params).useCase)!;
  return ogCard({
    title: u.name,
    kicker: u.specs
      .slice(0, 2)
      .map(s => s.value)
      .join(' · '),
  });
}
