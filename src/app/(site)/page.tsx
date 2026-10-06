import { Hero } from '@/components/home/Hero';
import { Faq, FinalCta, Gallery, MadeFor, Privacy, Problem, Steps } from '@/components/home/Sections';
import { Showcase } from '@/components/home/Showcase';
import '@/components/home/home.css';
import { HOME_FAQ } from '@/domain/promo/content/faq';
import { RECIPES, SIGNATURE_REELS } from '@/domain/promo/recipes';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { faqPage, softwareApplication } from '@/lib/seo/schema';

export const metadata = pageMetadata({
  title: 'PromoReel: turn screenshots into a launch video. Free.',
  description:
    'Turn your app screenshots into a polished promo video in two minutes. Pick a style, AI directs it, download the MP4. Free, no signup, and your screenshots never leave your browser.',
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
