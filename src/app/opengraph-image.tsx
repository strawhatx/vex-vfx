import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'PromoReel: turn screenshots into a launch video. Free.';

export default function Image() {
  return ogCard({
    title: 'Turn screenshots into a launch video. Free.',
    kicker: 'Now showing · your product',
  });
}
