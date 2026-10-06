import { Hero } from '@/components/home/Hero';
import { Faq, FinalCta, Gallery, MadeFor, Privacy, Problem, Steps } from '@/components/home/Sections';
import { Showcase } from '@/components/home/Showcase';
import '@/components/home/home.css';
import { HOME_FAQ } from '@/domain/video/content/faq';
import { RECIPES, SIGNATURE_REELS } from '@/domain/video/recipes';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { faqPage, softwareApplication } from '@/lib/seo/schema';

export const metadata = pageMetadata({
  title: 'PromoReel: describe your product, get a launch video. Free.',
  description:
    'Make a launch video for your product out of motion graphics: kinetic type, counters, rings and cards in your brand. Pick a style, edit every scene, download the MP4. Free, no signup, made in your browser.',
  path: '/',
  absoluteTitle: true,
});

export default function Home() {
  return (
    <>
      <JsonLd data={[softwareApplication(), faqPage(HOME_FAQ)]} />
      <Hero />
      <Problem />
      <Showcase reels={SIGNATURE_REELS.map(r => ({ slug: r.slug, name: r.name, line: r.page.mood }))} />
      <Steps />
      <Gallery recipes={RECIPES} />
      <MadeFor />
      <Privacy />
      <Faq items={HOME_FAQ} />
      <FinalCta />
    </>
  );
}
