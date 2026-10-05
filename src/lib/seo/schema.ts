// Builders for the schema.org types the site uses: Organization, WebSite, SoftwareApplication,
// VideoObject, BreadcrumbList and FAQPage.
import { SITE, absolute } from './site';

export type Thing = Record<string, unknown> & { '@type': string };
export type WithContext<T extends Thing> = T & { '@context': 'https://schema.org' };

const ctx = <T extends Thing>(t: T): WithContext<T> => ({ '@context': 'https://schema.org', ...t });

export const organization = () =>
  ctx({
    '@type': 'Organization',
    '@id': `${SITE.url}/#org`,
    name: SITE.name,
    url: SITE.url,
    logo: absolute('/icon.svg'),
  });

export const website = () =>
  ctx({
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    publisher: { '@id': `${SITE.url}/#org` },
  });

export const softwareApplication = () =>
  ctx({
    '@type': 'SoftwareApplication',
    name: SITE.name,
    url: absolute('/create'),
    description: SITE.description,
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: 'Video editor',
    operatingSystem: 'Web browser',
    browserRequirements: 'A recent Chrome, Safari or Firefox with WebCodecs',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': `${SITE.url}/#org` },
  });

export interface VideoInfo {
  name: string;
  description: string;
  thumbnail: string;
  contentPath: string;
  seconds: number;
  uploadDate: string;
  transcript?: string;
}

export const videoObject = (v: VideoInfo) =>
  ctx({
    '@type': 'VideoObject',
    name: v.name,
    description: v.description,
    thumbnailUrl: absolute(v.thumbnail),
    contentUrl: absolute(v.contentPath),
    uploadDate: v.uploadDate,
    duration: `PT${Math.round(v.seconds)}S`,
    ...(v.transcript ? { transcript: v.transcript } : {}),
  });

export const breadcrumbs = (items: { name: string; path: string }[]) =>
  ctx({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absolute(it.path),
    })),
  });

export const faqPage = (qa: { q: string; a: string }[]) =>
  ctx({
    '@type': 'FAQPage',
    mainEntity: qa.map(x => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  });
