import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { GUIDES } from '@/domain/promo/content/guides';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Guides: launch videos and promoting side projects',
  description:
    'Practical guides for indie developers: how to make a Product Hunt launch video, App Store preview sizes, and how to promote a side project.',
  path: '/guides',
});

export default function GuidesIndex() {
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Guides', path: '/guides' }]} />
        <h1>Guides</h1>
        <p className="lede">Short, practical answers for launching what you built.</p>
      </header>
      <ul className="index-list">
        {GUIDES.map(g => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`}>
              <strong>{g.title}</strong>
              <span>{g.description}</span>
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
