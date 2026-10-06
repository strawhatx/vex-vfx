import Link from 'next/link';

// a film reel and the wordmark
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="PromoReel home">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#1D1D1F" />
        <circle cx="32" cy="32" r="6" fill="#FFFFFF" />
        <circle cx="32" cy="15" r="7" fill="#FFFFFF" />
        <circle cx="32" cy="49" r="7" fill="#FFFFFF" />
        <circle cx="15" cy="32" r="7" fill="#FFFFFF" />
        <circle cx="49" cy="32" r="7" fill="#FFFFFF" />
      </svg>
      PromoReel
    </Link>
  );
}
