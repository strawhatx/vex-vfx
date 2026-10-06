import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { GUIDES, guideBySlug } from '@/domain/video/content/guides';
import { findUseCase } from '@/domain/video/content/useCases';
import { recipeBySlug } from '@/domain/video/recipes';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { SITE, absolute } from '@/lib/seo/site';

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map(g => ({ slug: g.slug }));

export async function generateMetadata({ params }: PageProps<'/guides/[slug]'>) {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  return pageMetadata({ title: g.title, description: g.description, path: `/guides/${g.slug}` });
}

export default async function GuidePage({ params }: PageProps<'/guides/[slug]'>) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const { default: Article } = await import(`@/content/guides/${g.slug}.mdx`);

  return (
    <article className="page wrap">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.title,
          description: g.description,
          datePublished: g.published,
          dateModified: g.published,
          mainEntityOfPage: absolute(`/guides/${g.slug}`),
          author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
          publisher: { '@id': `${SITE.url}/#org` },
        }}
      />
      <header className="page-head">
        <Breadcrumbs
          items={[
            { name: 'Guides', path: '/guides' },
            { name: g.title, path: `/guides/${g.slug}` },
          ]}
        />
        <h1>{g.title}</h1>
        <p className="lede">{g.description}</p>
        <p className="label">
          Updated <time dateTime={g.published}>{g.published}</time>
        </p>
      </header>
      <div className="prose">
        <Article />
      </div>
      <aside className="section" aria-labelledby="related">
        <h2 id="related">Related</h2>
        <ul className="chips">
          {g.related.useCases.map(s => (
            <li key={s} style={{ padding: 0, border: 0 }}>
              <Link href={`/for/${s}`}>{findUseCase(s)?.name}</Link>
            </li>
          ))}
          {g.related.recipes.map(s => (
            <li key={s} style={{ padding: 0, border: 0 }}>
              <Link href={`/aesthetics/${s}`}>{recipeBySlug(s)?.name} style</Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="cta-band">
        <h2>Make yours now</h2>
        <p className="muted">A few minutes, free, and made in your browser.</p>
        <CtaLink href="/create" className="btn btn-primary">
          Make my video
        </CtaLink>
      </div>
    </article>
  );
}
