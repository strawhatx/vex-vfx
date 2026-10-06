import Link from 'next/link';
import { COMPETITORS } from '@/domain/video/content/competitors';
import { GUIDES } from '@/domain/video/content/guides';
import { USE_CASES } from '@/domain/video/content/useCases';
import { RECIPES } from '@/domain/video/recipes';

// the footer: a note, every section linked in columns, then the fine print
export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="footer-note">
          PromoReel makes your video in your browser, and your project is saved on this device. Nothing is
          uploaded; AI scripting, when it comes, uses your own key.
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
