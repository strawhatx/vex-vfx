import Link from 'next/link';
import { COMPETITORS } from '@/domain/promo/content/competitors';
import { GUIDES } from '@/domain/promo/content/guides';
import { USE_CASES } from '@/domain/promo/content/useCases';
import { RECIPES } from '@/domain/promo/recipes';

// the footer: a note, every section linked in columns, then the fine print
export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="footer-note">
          PromoReel makes your video in your browser. Screenshots are never uploaded. Directing with AI uses
          your own chat subscription or API key, or no AI at all.
        </p>
        <div className="footer-cols">
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
        <div className="footer-base">
          <p>PromoReel. Free, in your browser.</p>
          <ul>
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
        </div>
      </div>
    </footer>
  );
}
