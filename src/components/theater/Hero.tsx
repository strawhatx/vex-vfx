import { CtaLink } from '@/components/site/CtaLink';
import { TheaterFx } from './TheaterFx';

// The first screen: a dark cinema, curtains drawn back, the headline on the screen. All real text,
// visible on first paint; the intro and the 3D light only move what's around it.
export function Hero() {
  return (
    <section className="theater" aria-labelledby="hero-title">
      <div className="valance" aria-hidden="true" />
      <div className="curtain curtain-l" aria-hidden="true" />
      <div className="curtain curtain-r" aria-hidden="true" />
      <div className="beam-slot" aria-hidden="true" />
      <div className="screen-wrap">
        <div className="screen">
          <p className="label screen-label">Now showing · your product</p>
          <h1 id="hero-title">
            Turn screenshots into a launch video. <em>Free.</em>
          </h1>
          <p className="hero-sub">
            Drop in 3–6 screenshots, pick a style, and AI directs a promo video for X, Product Hunt and
            TikTok. Your screenshots never leave your browser.
          </p>
          <div className="hero-ctas">
            <CtaLink href="/create" className="btn btn-primary">
              Make my video
            </CtaLink>
            <a className="btn btn-ghost-dark" href="#premiere">
              See the styles
            </a>
          </div>
        </div>
      </div>
      <div className="seats" aria-hidden="true" />
      <div className="house-lights" aria-hidden="true" />
      <TheaterFx />
    </section>
  );
}
