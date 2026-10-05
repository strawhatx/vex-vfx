import { Hero } from '@/components/theater/Hero';
import { Premiere } from '@/components/theater/Premiere';
import { Acts, Faq, MadeFor, Marquee, NowShowing, PrivacyNote, Problem } from '@/components/theater/Sections';
import '@/components/theater/theater.css';
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
      <Premiere reels={SIGNATURE_REELS.map(r => ({ slug: r.slug, name: r.name, line: r.page.mood }))} />
      <Acts />
      <NowShowing recipes={RECIPES} />
      <MadeFor />
      <PrivacyNote />
      <Faq items={HOME_FAQ} />
      <Marquee />
    </>
  );
}
