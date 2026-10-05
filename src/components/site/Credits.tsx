import Link from 'next/link';
import { RECIPES } from '@/domain/promo/recipes';
import { USE_CASES } from '@/domain/promo/content/useCases';
import { GUIDES } from '@/domain/promo/content/guides';
import { COMPETITORS } from '@/domain/promo/content/competitors';
import { Logo } from './Logo';

// the footer, as end credits: every section linked, billed like a film
export function Credits() {
  return (
    <footer className="credits">
      <div className="wrap credits-roll">
        <Logo />
        <p className="credits-billing">
          <span>Directed by</span>You
          <span>Edited by</span>AI, or a few good rules
          <span>Rendered in</span>Your browser
        </p>
        <div className="credits-cols">
          <div>
            <h2>Styles</h2>
            <ul>
              {RECIPES.map(r => (
                <li key={r.slug}>
                  <Link href={`/aesthetics/${r.slug}`}>{r.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Made for</h2>
            <ul>
              {USE_CASES.map(u => (
                <li key={u.slug}>
                  <Link href={`/for/${u.slug}`}>{u.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Guides</h2>
            <ul>
              {GUIDES.map(g => (
                <li key={g.slug}>
                  <Link href={`/guides/${g.slug}`}>{g.title.split(':')[0].split(' (')[0]}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Compare</h2>
            <ul>
              {COMPETITORS.map(c => (
                <li key={c.slug}>
                  <Link href={`/alternatives/${c.slug}`}>{c.name} alternative</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ul className="fine" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <li>
            <Link href="/create">Make a video</Link>
          </li>
          <li>
            <Link href="/examples">Examples</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
          <li>
            <a href="/llms.txt">llms.txt</a>
          </li>
        </ul>
        <p className="fine">No screenshots were uploaded in the making of this video.</p>
      </div>
    </footer>
  );
}
