import Link from 'next/link';
import { JsonLd } from '@/lib/seo/JsonLd';
import { breadcrumbs } from '@/lib/seo/schema';

// visible breadcrumbs and their BreadcrumbList structured data
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  const all = [{ name: 'Home', path: '/' }, ...items];
  return (
    <nav className="crumbs label" aria-label="Breadcrumb">
      <JsonLd data={breadcrumbs(all)} />
      <ol>
        {all.map((it, i) =>
          i === all.length - 1 ? (
            <li key={it.path} aria-current="page">
              {it.name}
            </li>
          ) : (
            <li key={it.path}>
              <Link href={it.path}>{it.name}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
