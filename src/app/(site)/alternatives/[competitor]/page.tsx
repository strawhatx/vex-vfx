import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { COMPETITORS, REVIEWED, competitorBySlug } from '@/domain/promo/content/competitors';
import { pageMetadata } from '@/lib/seo/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => COMPETITORS.map(c => ({ competitor: c.slug }));

export async function generateMetadata({ params }: PageProps<'/alternatives/[competitor]'>) {
  const c = competitorBySlug((await params).competitor);
  if (!c) return {};
  return pageMetadata({
    title: `${c.name} alternative for app promo videos: an honest comparison`,
    description: `${c.name} vs PromoReel: what each is for, how they differ on platform, price model, workflow and privacy, and when to pick which.`,
    path: `/alternatives/${c.slug}`,
  });
}

export default async function AlternativePage({ params }: PageProps<'/alternatives/[competitor]'>) {
  const c = competitorBySlug((await params).competitor);
  if (!c) notFound();
  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs
          items={[
            { name: 'Compare', path: '/alternatives' },
            { name: `${c.name} alternative`, path: `/alternatives/${c.slug}` },
          ]}
        />
        <h1>{c.name} alternative for app promo videos</h1>
        <p className="answer">
          {c.what} PromoReel does one narrower job: it turns 3–6 screenshots into a finished, captioned promo
          video, directed by AI, free and in your browser. If you need{' '}
          {c.bestFor.toLowerCase().replace(/\.$/, '')}, {c.name} is the better pick; if you need a launch
          video in two minutes, try PromoReel.
        </p>
      </header>

      <section aria-labelledby="table">
        <h2 id="table" className="label" style={{ marginBottom: 14 }}>
          Side by side
        </h2>
        <div className="table-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Aspect</span>
                </th>
                <th scope="col">{c.name}</th>
                <th scope="col">PromoReel</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map(([k, them, us]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{them}</td>
                  <td>{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine" style={{ marginTop: 12 }}>
          Reviewed <time dateTime={REVIEWED}>{REVIEWED}</time>. Products change; check{' '}
          <a className="link" href={c.site} rel="noopener noreferrer">
            {c.name}’s site
          </a>{' '}
          for current features and pricing.
        </p>
      </section>

      <section className="section two-col" aria-label="When to choose which">
        <div>
          <h2>Choose {c.name} if</h2>
          <ul className="prose">
            {c.chooseThem.map(x => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Choose PromoReel if</h2>
          <ul className="prose">
            {c.chooseUs.map(x => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="cta-band">
        <h2>Try it on your screenshots</h2>
        <p className="muted">Free, no signup. If it’s not for you, you’ve lost two minutes.</p>
        <CtaLink href="/create" className="btn btn-primary">
          Make my video
        </CtaLink>
      </div>
    </div>
  );
}
