import Link from 'next/link';

// a film reel and the wordmark
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="PromoReel home">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#FFB547" />
        <circle cx="32" cy="32" r="6" fill="#0B0A09" />
        <circle cx="32" cy="15" r="7" fill="#0B0A09" />
        <circle cx="32" cy="49" r="7" fill="#0B0A09" />
        <circle cx="15" cy="32" r="7" fill="#0B0A09" />
        <circle cx="49" cy="32" r="7" fill="#0B0A09" />
      </svg>
      PromoReel
    </Link>
  );
}
