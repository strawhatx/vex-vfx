// What the landing and contact pages share: their font and styles, the top bar and the footer
import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';
import './landing.css';

const grotesk = Space_Grotesk({
  variable: '--font-grotesk',
  weight: ['400', '500', '700'],
  subsets: ['latin'],
});

// the class a landing page's outermost element takes: its font and its scoped styles
export const landingClass = `landing ${grotesk.variable}`;

export function LandingNav() {
  return (
    <nav>
      <div className="wrap">
        <Link className="logo" href="/">
          Flare<b>cut</b>
        </Link>
        <Link className="pill" href="/editor">
          Open the editor
        </Link>
      </div>
    </nav>
  );
}

export function LandingFooter() {
  return (
    <footer>
      <div className="wrap">
        <span>© 2026 FlareCut</span>
        <span className="links">
          <Link href="/contact">Contact</Link>
          <a href="https://x.com/heynathanielj" target="_blank" rel="noopener noreferrer">
            @heynathanielj on X
          </a>
        </span>
      </div>
    </footer>
  );
}
