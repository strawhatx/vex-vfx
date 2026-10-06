import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { USE_CASES } from '@/domain/video/content/useCases';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Launch video sizes and lengths for every platform',
  description:
    'The right size, length and format for a launch video on Product Hunt, the App Store, TikTok, X, your landing page and your changelog, with a free tool to make each one.',
  path: '/for',
});

export default function ForIndex() {
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Made for', path: '/for' }]} />
        <h1>Launch videos, sized for where you post</h1>
        <p className="lede">
          Every platform wants something different: a YouTube link on Product Hunt, 15–30 seconds on the App
          Store, captions clear of TikTok’s buttons. Pick yours for the specs, tips and a tool preset.
        </p>
      </header>
      <ul className="index-list">
        {USE_CASES.map(u => (
          <li key={u.slug}>
            <Link href={`/for/${u.slug}`}>
              <strong>{u.name}</strong>
              <span>
                {u.specs
                  .slice(0, 2)
                  .map(s => `${s.label}: ${s.value}`)
                  .join(' · ')}
              </span>
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
