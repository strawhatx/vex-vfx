'use client';

// The tool runs only in the browser (it decodes images, draws on canvas and encodes video), so it's
// loaded client-side after the page's static shell has painted.
import dynamic from 'next/dynamic';

const CreateApp = dynamic(() => import('./CreateApp').then(m => m.CreateApp), {
  ssr: false,
  loading: () => (
    <div className="studio-loading" role="status">
      <p className="label">Threading the projector…</p>
    </div>
  ),
});

export function CreateIsland() {
  return <CreateApp />;
}
