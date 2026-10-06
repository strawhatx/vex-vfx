import Link from 'next/link';
import { CreateIsland } from '@/components/create/CreateIsland';
import '@/components/create/create.css';
import { Logo } from '@/components/site/Logo';
import { JsonLd } from '@/lib/seo/JsonLd';
import { pageMetadata } from '@/lib/seo/metadata';
import { softwareApplication } from '@/lib/seo/schema';

export const metadata = pageMetadata({
  title: 'App promo video maker: make yours from screenshots',
  description:
    'Free app promo video maker in your browser. Drop in 3–6 screenshots, pick a style, let AI direct, and download a 9:16 or 16:9 MP4. No signup; screenshots never leave your device.',
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
            Pick a style, drop in 3–6 screenshots, and let AI (or the built-in rules) direct a 10–45 second
            video. Edit the captions, then download a 9:16 or 16:9 MP4. Free, and nothing leaves your browser.
          </p>
        </div>
        <CreateIsland />
      </main>
    </div>
  );
}
