import Link from 'next/link';
import { ENGINE_GROUP, ENGINE_NAMES } from '@/domain/effects/draft';
import type { Engine } from '@/domain/effects/passes';

// the lab: an engine to build effects with
export default function Lab() {
  return (
    <main className="home">
      <strong className="wordmark" aria-label="FlareCut lab">
        FLARE<em>CUT</em> LAB
      </strong>
      <nav className="home-links" aria-label="Engines">
        {(Object.keys(ENGINE_GROUP) as Engine[]).map(e => (
          <Link key={e} className="home-link" href={`/lab/${e}`}>
            {ENGINE_NAMES[e]}
          </Link>
        ))}
        <Link className="home-link subtle" href="/">
          Home
        </Link>
      </nav>
    </main>
  );
}
