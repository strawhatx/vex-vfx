import Link from 'next/link';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import { CtaLink } from '@/components/site/CtaLink';
import { USE_CASES } from '@/domain/video/content/useCases';
import type { Recipe } from '@/domain/video/recipe';

// The problem, said plainly in one big paragraph.
export function Problem() {
  return (
    <section className="statement-band" aria-labelledby="problem-title">
      <div className="wrap">
        <h2 id="problem-title" className="visually-hidden">
          Why launch videos don’t get made
        </h2>
        <p className="statement" data-reveal>
          Launch day. Everything’s shipped. Except the video.{' '}
          <span className="muted">
            An editor costs $500 and a week. After Effects costs a weekend you don’t have.
          </span>{' '}
          PromoReel takes two minutes.
        </p>
      </div>
    </section>
  );
}

// How it works, in three cards on a mist band.
export function Steps() {
  const steps = [
    ['Pick a style.', 'Five looks, from Clean Soft to Retro Terminal. Each one plays its own preview.'],
    [
      'Make it yours.',
      'Put in your product’s name, logo, brand colour and your real numbers. Every scene is editable.',
    ],
    [
      'Download it.',
      'The MP4 is made in your browser in seconds: 9:16, 1:1 or 16:9. AI scripting with your own Gemini or Claude key comes next.',
    ],
  ];
  return (
    <section className="band" aria-labelledby="steps-title">
      <div className="wrap-wide">
        <h2 id="steps-title" className="band-title" data-split>
          How it works.
        </h2>
        <ol className="cards">
          {steps.map(([title, text], i) => (
            <li key={title} className="card" data-reveal>
              <span className="card-n">{i + 1}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Every style, each tile playing its preview when hovered or focused.
export function Gallery({ recipes }: { recipes: readonly Recipe[] }) {
  return (
    <section className="section-pad" aria-labelledby="gallery-title">
      <div className="wrap-wide">
        <h2 id="gallery-title" className="band-title" data-split>
          Five styles. Same video.
        </h2>
        <ul className="tiles">
          {recipes.map(r => (
            <li key={r.slug} data-reveal>
              <Link href={`/aesthetics/${r.slug}`} className="tile" data-preview>
                <div className="tile-media">
                  <EnginePlayer
                    recipe={r.slug}
                    format="9:16"
                    mode="hover"
                    maxShort={400}
                    label={`${r.name} style preview`}
                  />
                </div>
                <strong>{r.name}</strong>
                <span className="muted">{r.page.mood[0].toUpperCase() + r.page.mood.slice(1)}</span>
                <span className="more">Learn more</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MadeFor() {
  return (
    <section className="section-pad" aria-labelledby="madefor-title">
      <div className="wrap">
        <h2 id="madefor-title" className="band-title" data-split>
          Sized for where you launch.
        </h2>
        <ul className="index-list">
          {USE_CASES.map(u => (
            <li key={u.slug}>
              <Link href={`/for/${u.slug}`}>
                <strong>{u.name}</strong>
                <span>
                  {u.specs[0].value} · {u.specs[1].value}
                </span>
                <span className="arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Privacy() {
  return (
    <section className="band" aria-labelledby="privacy-title">
      <div className="wrap-wide">
        <h2 id="privacy-title" className="band-title" data-split>
          Your work stays in this browser.
        </h2>
        <div className="cards">
          <div className="card" data-reveal>
            <h3>Made on your device.</h3>
            <p className="muted">
              Every frame is drawn and encoded into an MP4 right here. Your project is saved on this device.
              No upload, no account.
            </p>
          </div>
          <div className="card" data-reveal>
            <h3>Your numbers, checked.</h3>
            <p className="muted">
              Every number in your video is one you typed or confirmed. Nothing is invented, and nothing ships
              until you’ve checked it.
            </p>
          </div>
          <div className="card" data-reveal>
            <h3>Free.</h3>
            <p className="muted">
              The video ends with a small “Made with PromoReel” card. That’s the deal.{' '}
              <Link href="/privacy" className="more">
                Privacy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="section-pad" aria-labelledby="faq-title">
      <div className="wrap faq">
        <h2 id="faq-title" className="band-title" data-split>
          Questions.
        </h2>
        {items.map(x => (
          <details key={x.q}>
            <summary>{x.q}</summary>
            <p>{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-title">
      <div className="wrap">
        <h2 id="final-title">Your launch video. Two minutes from now.</h2>
        <div className="hero-ctas">
          <CtaLink href="/create" className="btn btn-primary">
            Make my video
          </CtaLink>
          <Link className="more" href="/examples">
            See examples
          </Link>
        </div>
      </div>
    </section>
  );
}
