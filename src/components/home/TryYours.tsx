// After the styles: your turn. The card links into the tool, which opens on an example to make your
// own (describing your product to the AI comes next).
import Link from 'next/link';
import { CtaLink } from '@/components/site/CtaLink';

export function TryYours() {
  return (
    <div className="wrap-wide try">
      <div className="try-card">
        <h2>Now make yours.</h2>
        <p className="muted">
          Start from an example, put in your product and your real numbers. It stays in this browser.
        </p>
        <div className="hero-ctas">
          <CtaLink href="/create" className="btn btn-primary">
            Make my video
          </CtaLink>
          <Link className="more" href="/examples">
            See examples
          </Link>
        </div>
      </div>
    </div>
  );
}
