import { ogCard, OG_SIZE } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'PromoReel: describe your product, get a launch video.';

export default function Image() {
  return ogCard({
    title: 'Describe your product. Get a launch video.',
    kicker: 'Now showing · your product',
  });
}
