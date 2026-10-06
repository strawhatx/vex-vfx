import Link from 'next/link';
import type { ReactNode } from 'react';

// a link styled as a button (the pill styles live in globals.css)
export function CtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
