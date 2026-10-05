import Link from 'next/link';
import { CtaLink } from './CtaLink';
import { Logo } from './Logo';

export function Nav() {
  return (
    <header className="nav">
      <Logo />
      <nav aria-label="Main">
        <ul className="nav-links">
          <li>
            <Link href="/aesthetics">Styles</Link>
          </li>
          <li>
            <Link href="/for">Use cases</Link>
          </li>
          <li>
            <Link href="/examples">Examples</Link>
          </li>
          <li>
            <Link href="/guides">Guides</Link>
          </li>
        </ul>
      </nav>
      <CtaLink href="/create" className="btn btn-primary btn-sm">
        Make my video
      </CtaLink>
    </header>
  );
}
