import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import { ExampleVideo } from '@/components/content/ExampleVideo';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { CtaLink } from '@/components/site/CtaLink';
import { USE_CASES } from '@/domain/video/content/useCases';
import { MOVES } from '@/domain/video/moves';
import { SCENES } from '@/domain/video/scenes';
import { RECIPES, recipeBySlug } from '@/domain/video/recipes';
import { availableExamples } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => RECIPES.map(r => ({ slug: r.slug }));

export async function generateMetadata({ params }: PageProps<'/aesthetics/[slug]'>) {
  const r = recipeBySlug((await params).slug);
  if (!r) return {};
  return pageMetadata({
    title: r.page.title,
    description: r.page.description,
    path: `/aesthetics/${r.slug}`,
  });
}

export default async function AestheticPage({ params }: PageProps<'/aesthetics/[slug]'>) {
  const r = recipeBySlug((await params).slug);
  if (!r) notFound();
  const examples = availableExamples().filter(e => e.recipe === r.slug);
  const fits = USE_CASES.filter(u => u.recipes.includes(r.slug));
  const moves = [...r.textMoves, ...r.transitions];

  return (
    <div className="page wrap">
      <header className="page-head">
        <Breadcrumbs
          items={[
            { name: 'Styles', path: '/aesthetics' },
            { name: r.name, path: `/aesthetics/${r.slug}` },
          ]}
        />
        <p className="label">{r.page.keyword}</p>
        <h1>{r.name} product video template</h1>
        <p className="answer">{r.page.description}</p>
        <div className="hero-ctas">
          <CtaLink href={`/create?style=${r.slug}`} className="btn btn-primary">
            Use this style
          </CtaLink>
        </div>
      </header>

      <div className="two-col">
        <section aria-labelledby="look">
          <h2 id="look" className="visually-hidden">
            What it looks like
          </h2>
          <div className="live">
            <div className="live-tall">
              <EnginePlayer
                recipe={r.slug}
                format="9:16"
                mode="loop"
                label={`${r.name} vertical preview`}
                maxShort={480}
              />
            </div>
            <div className="live-wide">
              <EnginePlayer
                recipe={r.slug}
                format="16:9"
                example="orbit-feature"
                mode="loop"
                label={`${r.name} horizontal preview`}
                maxShort={480}
              />
            </div>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>
            Live preview, drawn by the same engine that exports your video.
          </p>
        </section>
        <section aria-labelledby="about" className="prose">
          <h2 id="about" style={{ marginTop: 0 }}>
            The look
          </h2>
          <p>{r.page.blurb}</p>
          <h3>Best for</h3>
          <ul>
            {r.page.bestFor.map(b => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <h3>The recipe</h3>
          <ul>
            <li>
              Colours: background {r.palette.bg}, text {r.palette.fg}, accent {r.palette.accent}, plus your
              brand colour
            </li>
            <li>Texture: {r.texture === 'none' ? 'clean' : r.texture}</li>
            <li>Pace: {r.motion.tempo}</li>
            <li>Scenes: {r.scenes.map(t => SCENES[t].label.toLowerCase()).join(', ')}</li>
          </ul>
        </section>
      </div>

      <section className="section" aria-labelledby="moves">
        <h2 id="moves">The moves it uses</h2>
        <ul className="chips">
          {moves.map(m => (
            <li key={m} title={MOVES[m].describe}>
              {MOVES[m].label}
            </li>
          ))}
        </ul>
      </section>

      {examples.length > 0 && (
        <section className="section" aria-labelledby="example">
          <h2 id="example">Example video</h2>
          <div className="examples-grid">
            {examples.map(e => (
              <ExampleVideo key={e.slug} example={e} />
            ))}
          </div>
        </section>
      )}

      {fits.length > 0 && (
        <section className="section" aria-labelledby="fits">
          <h2 id="fits">Where it works</h2>
          <ul className="index-list">
            {fits.map(u => (
              <li key={u.slug}>
                <Link href={`/for/${u.slug}`}>
                  <strong>{u.name}</strong>
                  <span>
                    {u.specs
                      .map(s => s.value)
                      .slice(0, 2)
                      .join(' · ')}
                  </span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cta-band">
        <h2>Make it {r.name}</h2>
        <p className="muted">Opens the tool with this style picked. Bring your logo and your real numbers.</p>
        <CtaLink href={`/create?style=${r.slug}`} className="btn btn-primary">
          Use this style
        </CtaLink>
      </div>
    </div>
  );
}
