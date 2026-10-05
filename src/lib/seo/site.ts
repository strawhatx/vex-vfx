// The site's name, address and one-line pitch, used in metadata, structured data and llms.txt.
// NEXT_PUBLIC_SITE_URL is the public address (not a secret); set it per deploy.

export const SITE = {
  name: 'PromoReel',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://promoreel.app').replace(/\/+$/, ''),
  tagline: 'Turn screenshots into a launch video. Free.',
  description:
    'PromoReel turns 3–6 screenshots of your app into a polished promo video in a style you pick, directed by AI. Free, no signup, and your screenshots never leave your browser.',
  locale: 'en_US',
} as const;

export const absolute = (path: string) => `${SITE.url}${path === '/' ? '' : path}`;
