import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { COMPETITORS } from '@/domain/video/content/competitors';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'PromoReel compared: Rotato, Screen Studio, Canva, Previewed',
  description:
    'Honest comparisons between PromoReel and other ways to make an app promo video, and when to pick each.',
  path: '/alternatives',
});

export default function AlternativesIndex() {
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Compare', path: '/alternatives' }]} />
        <h1>How PromoReel compares</h1>
        <p className="lede">Good tools, made for different jobs. Here’s where each one fits, fairly.</p>
      </header>
      <ul className="index-list">
        {COMPETITORS.map(c => (
          <li key={c.slug}>
            <Link href={`/alternatives/${c.slug}`}>
              <strong>{c.name} alternative</strong>
              <span>{c.bestFor}</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
