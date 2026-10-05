import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExampleVideo } from '@/components/content/ExampleVideo';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { GUIDES } from '@/domain/promo/content/guides';
import { USE_CASES, findUseCase } from '@/domain/promo/content/useCases';
import { recipeBySlug } from '@/domain/promo/recipes';
import { availableExamples } from '@/lib/examples';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { faqPage } from '@/lib/seo/schema';

export const dynamicParams = false;
export const generateStaticParams = () => USE_CASES.map(u => ({ useCase: u.slug }));

export async function generateMetadata({ params }: PageProps<'/for/[useCase]'>) {
  const u = findUseCase((await params).useCase);
  if (!u) return {};
  return pageMetadata({ title: u.title, description: u.description, path: `/for/${u.slug}` });
}

export default async function UseCasePage({ params }: PageProps<'/for/[useCase]'>) {
  const u = findUseCase((await params).useCase);
  if (!u) notFound();
  const create = `/create?for=${u.slug}&style=${u.recipes[0]}`;
  const example = availableExamples().find(e => e.aspect === u.aspect && u.recipes.includes(e.recipe));
  const guides = GUIDES.filter(g => g.related.useCases.includes(u.slug));

  return (
    <div className="page wrap">
      <JsonLd data={faqPage(u.faq)} />
      <header className="page-head">
        <Breadcrumbs
          items={[
            { name: 'Made for', path: '/for' },
            { name: u.name, path: `/for/${u.slug}` },
          ]}
        />
        <h1>{u.h1}</h1>
        <p className="answer">{u.answer}</p>
        <div className="hero-ctas">
          <CtaLink href={create} className="btn btn-primary">
            Make my video
          </CtaLink>
        </div>
      </header>

      <section aria-labelledby="specs">
        <h2 id="specs" className="label" style={{ marginBottom: 14 }}>
          The specs
        </h2>
        <dl className="specs">
          {u.specs.map(s => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section" aria-labelledby="tips">
        <h2 id="tips">Tips that work</h2>
        <ol className="tips">
          {u.tips.map(t => (
            <li key={t.title}>
              <h3>{t.title}</h3>
              <p className="muted">{t.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {example && (
        <section className="section" aria-labelledby="ex">
          <h2 id="ex">An example</h2>
          <ExampleVideo example={example} />
        </section>
      )}

      <section className="section" aria-labelledby="styles">
        <h2 id="styles">Styles that suit it</h2>
        <ul className="index-list">
          {u.recipes.map(slug => {
            const r = recipeBySlug(slug)!;
            return (
              <li key={slug}>
                <Link href={`/aesthetics/${slug}`}>
                  <strong>{r.name}</strong>
                  <span>{r.page.mood}</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section faq" aria-labelledby="q">
        <h2 id="q">Questions</h2>
        {u.faq.map(x => (
          <details key={x.q}>
            <summary>{x.q}</summary>
            <p>{x.a}</p>
          </details>
        ))}
      </section>

      {guides.length > 0 && (
        <section className="section" aria-labelledby="read">
          <h2 id="read">Read next</h2>
          <ul className="chips">
            {guides.map(g => (
              <li key={g.slug} style={{ padding: 0, border: 0 }}>
                <Link href={`/guides/${g.slug}`}>{g.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cta-band">
        <h2>Your {u.name.toLowerCase()}, in two minutes</h2>
        <p className="muted">
          Opens the tool sized for it ({u.specs[0].value}). Free, and your screenshots stay on your device.
        </p>
        <CtaLink href={create} className="btn btn-primary">
          Make my video
        </CtaLink>
      </div>
    </div>
  );
}
