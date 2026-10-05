import Link from 'next/link';
import { Logo } from '@/components/site/Logo';

export const metadata = { title: 'Page not found', robots: { index: false } };

// a missing page: dark screen, a way back
export default function NotFound() {
  return (
    <main
      className="page wrap"
      style={{ minHeight: '80svh', display: 'grid', alignContent: 'center', gap: 20 }}
    >
      <Logo />
      <p className="label">Reel missing</p>
      <h1 style={{ fontSize: 'clamp(48px, 9vw, 112px)' }}>This scene was cut.</h1>
      <p className="lede">The page you’re looking for isn’t here.</p>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/create" className="btn btn-primary">
          Make my video
        </Link>
        <Link href="/" className="btn">
          Back to the start
        </Link>
      </p>
    </main>
  );
}
