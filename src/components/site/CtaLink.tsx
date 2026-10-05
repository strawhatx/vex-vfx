'use client';

// A link styled as a button that leans toward the pointer (magnetic) on fine pointers.
import Link from 'next/link';
import { useRef, type ReactNode } from 'react';

export function CtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 12}px`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 10}px`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--mx', '0px');
    ref.current?.style.setProperty('--my', '0px');
  };
  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onPointerMove={move}
      onPointerLeave={leave}
      data-cursor="hover"
    >
      {children}
    </Link>
  );
}
