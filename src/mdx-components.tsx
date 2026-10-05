import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';

// Guides are written in MDX: internal links go through next/link; tables scroll on small screens.
const components: MDXComponents = {
  a: ({ href = '', children }) =>
    href.startsWith('/') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    ),
  table: props => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
