import { CtaLink } from '@/components/site/CtaLink';
import { HeroStage } from './HeroStage';

// The first screen, the way Apple opens a product page: a centred kicker and headline, one blue
// action, and the product itself playing large below. All real text, in the HTML.
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-copy">
        <p className="kicker">
          PromoReel <span className="new">Free</span>
        </p>
        <h1 id="hero-title">Turn screenshots into a launch video. Free.</h1>
        <p className="hero-sub">
          Drop in 3–6 screenshots, pick a style, and AI directs a promo video for X, Product Hunt and TikTok.
          Your screenshots never leave your browser.
        </p>
        <div className="hero-ctas">
          <CtaLink href="/create" className="btn btn-primary">
            Make my video
          </CtaLink>
          <a className="more" href="#styles">
            See the styles
          </a>
        </div>
      </div>
      <HeroStage />
    </section>
  );
}
