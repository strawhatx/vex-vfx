// Every page's metadata from one helper: its title and description, canonical URL, and Open Graph
// and Twitter cards (the image comes from the route's opengraph-image file).
import type { Metadata } from 'next';
import { SITE, absolute } from './site';

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  // the home page's title is used as is, without "| PromoReel"
  absoluteTitle?: boolean;
}): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: absolute(path) },
    openGraph: {
      title,
      description,
      url: absolute(path),
      siteName: SITE.name,
      locale: SITE.locale,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
