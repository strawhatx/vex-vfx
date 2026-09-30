import type { Metadata } from 'next';
import Landing from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: 'FlareCut: put fire on anything',
  description:
    'Tap a hand, a body, a car. Pick fire, lightning, rain, glitches, explosions or text behind you. It follows the whole clip. Free, in your browser.',
  openGraph: {
    title: 'FlareCut: put fire on anything',
    description:
      'Fire, lightning, water, glitches, impacts and text for your videos, in one tap. Free, in your browser.',
  },
};

// the landing page; the editor's start page is /editor
export default function Home() {
  return <Landing />;
}
