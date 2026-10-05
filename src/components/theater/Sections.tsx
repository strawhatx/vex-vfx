import Link from 'next/link';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import { CtaLink } from '@/components/site/CtaLink';
import { USE_CASES } from '@/domain/promo/content/useCases';
import type { Recipe } from '@/domain/promo/recipe';

// The problem, as subtitles over a dark screen.
export function Problem() {
  return (
    <section className="problem" aria-labelledby="problem-title">
      <div className="wrap">
        <h2 id="problem-title" className="visually-hidden">
          Why launch videos don’t get made
        </h2>
        <p className="subtitle" data-reveal>
          Launch day. Everything’s shipped. Except the video.
        </p>
        <p className="subtitle" data-reveal>
          An editor costs $500 and a week.
        </p>
        <p className="subtitle" data-reveal>
          After Effects costs a weekend you don’t have.
        </p>
        <p className="subtitle subtitle-answer" data-reveal>
          PromoReel takes two minutes.
        </p>
      </div>
    </section>
  );
}

// How it works, in three acts, on a strip of film.
export function Acts() {
  const acts = [
    [
      'Act I',
      'Pick a style',
      'Five aesthetics, from Clean Apple to Retro Terminal. Each tile plays its own preview.',
    ],
    [
      'Act II',
      'Drop your screenshots',
      '3–6 screens, plus your product’s name, a tagline and a link. The brand colour is picked up for you.',
    ],
    [
      'Act III',
      'AI directs',
      'Paste the prompt into Claude, ChatGPT or Gemini, use your own API key, or let the rules direct. Edit, re-direct, download.',
    ],
  ];
  return (
    <section className="acts" aria-labelledby="acts-title">
      <div className="wrap">
        <p className="label">How it works</p>
        <h2 id="acts-title" data-split>
          A film in three acts
        </h2>
        <ol className="strip">
          {acts.map(([act, title, text]) => (
            <li key={act} data-reveal>
              <span className="label">{act}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Now showing: every aesthetic as a poster that plays when hovered.
export function NowShowing({ recipes }: { recipes: readonly Recipe[] }) {
  return (
    <section className="now-showing" id="styles" aria-labelledby="styles-title">
      <div className="wrap">
        <p className="label">Now showing</p>
        <h2 id="styles-title" data-split>
          Five styles. Same screenshots.
        </h2>
        <ul className="posters">
          {recipes.map(r => (
            <li key={r.slug} data-reveal>
              <Link href={`/aesthetics/${r.slug}`} className="poster" data-preview>
                <div className="poster-media">
                  <EnginePlayer
                    recipe={r.slug}
                    aspect="9:16"
                    mode="hover"
                    maxShort={400}
                    label={`${r.name} style preview`}
                    className="poster-canvas"
                  />
                </div>
                <span className="label">{r.page.mood}</span>
                <strong>{r.name}</strong>
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
        <p className="label">Made for every premiere</p>
        <h2 id="madefor-title" data-split>
          Sized for where you launch
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
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PrivacyNote() {
  return (
    <section className="privacy-band section-pad" aria-labelledby="privacy-title">
      <div className="wrap privacy-grid">
        <h2 id="privacy-title" data-split>
          Your screenshots never leave this browser
        </h2>
        <div className="privacy-points">
          <p data-reveal>
            <strong>Made on your device.</strong> Screenshots are decoded, animated and encoded into an MP4
            right here. No upload, no account.
          </p>
          <p data-reveal>
            <strong>Your AI, or none.</strong> Use the chat you already pay for, your own API key (sent from
            your browser straight to Anthropic), or the built-in rules.
          </p>
          <p data-reveal>
            <strong>Free.</strong> The video ends with a small “Made with PromoReel” card. That’s the deal.{' '}
            <Link className="link" href="/privacy">
              Read the privacy page
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="section-pad" aria-labelledby="faq-title">
      <div className="wrap faq">
        <p className="label">Questions</p>
        <h2 id="faq-title" data-split>
          Before the lights go down
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

export function Marquee() {
  return (
    <section className="marquee-wrap section-pad" aria-labelledby="marquee-title">
      <div className="wrap">
        <div className="marquee">
          <p className="label">Tonight only. And every night.</p>
          <h2 id="marquee-title">Your premiere starts now</h2>
          <CtaLink href="/create" className="btn btn-primary">
            Make my video
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
