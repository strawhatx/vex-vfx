import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { RECIPES } from '@/domain/promo/recipes';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Product video templates: 5 styles for your launch video',
  description:
    'Five product video styles, from Clean Apple to Retro Terminal. Each turns your app screenshots into a promo video with its own colours, type, motion and cuts. Free, in your browser.',
  path: '/aesthetics',
});

export default function AestheticsPage() {
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Styles', path: '/aesthetics' }]} />
        <h1>Product video templates</h1>
        <p className="lede">
          Five styles for your launch video. Each one is a recipe of palette, two fonts, a motion style, a
          texture and a set of cuts. Drop in the same screenshots and get a very different film.
        </p>
      </header>
      <ul className="index-list">
        {RECIPES.map(r => (
          <li key={r.slug}>
            <Link href={`/aesthetics/${r.slug}`}>
              <strong>{r.name}</strong>
              <span>
                {r.page.mood} · best for {r.page.bestFor[0]}
              </span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="cta-band">
        <h2>Not sure? Try them all.</h2>
        <p className="muted">Switch styles in the tool and the video re-cuts itself in a second.</p>
        <CtaLink href="/create" className="btn btn-primary">
          Make my video
        </CtaLink>
      </div>
    </div>
  );
}
