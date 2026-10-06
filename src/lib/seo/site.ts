// The site's name, address and one-line pitch, used in metadata, structured data and llms.txt.
// NEXT_PUBLIC_SITE_URL is the public address (not a secret); set it per deploy.

export const SITE = {
  name: 'PromoReel',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://promoreel.app').replace(/\/+$/, ''),
  tagline: 'Describe your product. Get a launch video.',
  description:
    'PromoReel makes launch videos for software products out of motion graphics: kinetic type, counters, rings and cards in your brand. Pick a style, put in your product and your real numbers, edit every scene, and download an MP4. Free, and made in your browser.',
  locale: 'en_US',
} as const;

export const absolute = (path: string) => `${SITE.url}${path === '/' ? '' : path}`;
