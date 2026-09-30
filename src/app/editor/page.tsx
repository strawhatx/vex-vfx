import Link from 'next/link';
import { RecentProjects } from '@/components/home/RecentProjects';

// the editor's start page: a new project, or one kept on this device
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
      </nav>
      <RecentProjects />
    </main>
  );
}
