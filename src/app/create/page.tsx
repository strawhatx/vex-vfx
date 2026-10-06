import Link from 'next/link';
import { CreateIsland } from '@/components/create/CreateIsland';
import '@/components/create/create.css';
import { Logo } from '@/components/site/Logo';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { softwareApplication } from '@/lib/seo/schema';

export const metadata = pageMetadata({
  title: 'Product launch video maker, free in your browser',
  description:
    'Make a launch video for your product: kinetic type, counters, rings and cards in your brand. Pick a style, edit every scene, download a 9:16, 1:1 or 16:9 MP4. Free, no signup.',
  path: '/create',
});

// The tool: a static shell (heading and how-to text for search and for the first paint) around a
// client-only studio. No smooth scrolling here; it's an app.
export default function CreatePage() {
  return (
    <div className="create-page">
      <JsonLd data={softwareApplication()} />
      <header className="nav create-head">
        <Logo />
        <nav aria-label="Help">
          <Link href="/guides">Guides</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>
      <main id="main" className="create-main">
        <div className="create-intro">
          <h1>Make your promo video</h1>
          <p className="muted">
            Pick a style, start from an example and make it yours: your product, your brand colour, your real
            numbers. Edit every scene, then download a 9:16, 1:1 or 16:9 MP4. Free, and your project stays in
            this browser.
          </p>
        </div>
        <CreateIsland />
      </main>
    </div>
  );
}
