import Link from 'next/link';
import { RecentProjects } from '@/components/home/RecentProjects';
import { labOn } from './lab/enabled';

// the start page: a new project, or the lab to build effects in
export default function Home() {
  return (
    <main className="home">
      <strong className="wordmark" aria-label="FlareCut">
        FLARE<em>CUT</em>
      </strong>
      <nav className="home-links" aria-label="Start">
        <Link className="home-link primary" href="/editor/new">
          New project
        </Link>
        {labOn() && (
          <Link className="home-link" href="/lab">
            Lab
          </Link>
        )}
      </nav>
      <RecentProjects />
    </main>
  );
}
