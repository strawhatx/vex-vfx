import Link from 'next/link';
import { LAB_PAGES, type LabPage } from '@/domain/effects/draft';

// the lab: an engine (or transitions) to build effects with
export default function Lab() {
  return (
    <main className="home">
      <strong className="wordmark" aria-label="FlareCut lab">
        FLARE<em>CUT</em> LAB
      </strong>
      <nav className="home-links" aria-label="Engines">
        {(Object.keys(LAB_PAGES) as LabPage[]).map(p => (
          <Link key={p} className="home-link" href={`/lab/${p}`}>
            {LAB_PAGES[p].name}
          </Link>
        ))}
        <Link className="home-link subtle" href="/">
          Home
        </Link>
      </nav>
    </main>
  );
}
