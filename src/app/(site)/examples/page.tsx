import Link from 'next/link';
import { ExampleVideo } from '@/components/content/ExampleVideo';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { RECIPES } from '@/domain/video/recipes';
import { availableExamples } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata = pageMetadata({
  title: 'Product launch video examples, made with PromoReel',
  description:
    'Product launch video examples made with PromoReel: kinetic type, counters, rings and cards, in different styles and sizes, with the words on screen for each.',
  path: '/examples',
});

export default function ExamplesPage() {
  const examples = availableExamples();
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs items={[{ name: 'Examples', path: '/examples' }]} />
        <h1>Launch video examples</h1>
        <p className="lede">
          Made with PromoReel for Orbit, a demo app. Same product, different styles and sizes: see what yours
          could look like.
        </p>
      </header>
      {examples.length ? (
        <div className="examples-grid">
          {examples.map(e => (
            <ExampleVideo key={e.slug} example={e} headingLevel={2} />
          ))}
        </div>
      ) : (
        <div className="prose">
          <p>
            The example reels are being cut. Meanwhile, every style page plays a live preview drawn by the
            same engine:{' '}
            {RECIPES.map((r, i) => (
              <span key={r.slug}>
                <Link href={`/aesthetics/${r.slug}`}>{r.name}</Link>
                {i < RECIPES.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
        </div>
      )}
      <div className="cta-band">
        <h2>Your turn</h2>
        <CtaLink href="/create" className="btn btn-primary">
          Make my video
        </CtaLink>
      </div>
    </div>
  );
}
