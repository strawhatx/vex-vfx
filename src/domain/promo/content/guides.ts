// The guides (MDX in src/content/guides): their titles, descriptions and the pages they link to.
export interface Guide {
  slug: string;
  title: string;
  description: string;
  keyword: string;
  published: string;
  related: { useCases: string[]; recipes: string[] };
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-make-a-product-hunt-launch-video',
    title: 'How to make a Product Hunt launch video (without a video editor)',
    description:
      'What a Product Hunt video needs, how long it should be, how to add it to your gallery, and how to make one from screenshots in two minutes.',
    keyword: 'how to make a product hunt launch video',
    published: '2026-10-05',
    related: {
      useCases: ['product-hunt-launch-video', 'x-launch-video'],
      recipes: ['clean-apple', 'brutalist'],
    },
  },
  {
    slug: 'app-store-preview-video-size',
    title: 'App Store preview video size, length and format (2026)',
    description:
      'The resolutions, lengths and formats Apple accepts for app previews, what App Review checks, and how to make one quickly.',
    keyword: 'best size for an app store preview',
    published: '2026-10-05',
    related: { useCases: ['app-store-preview-video'], recipes: ['clean-apple', 'swiss-minimal'] },
  },
  {
    slug: 'how-to-promote-a-side-project',
    title: 'How to promote a side project: a launch-week plan for solo developers',
    description:
      'A practical plan for launching a side project on X, Product Hunt, Reddit and TikTok, with what to post each day and why a short video helps.',
    keyword: 'how to promote a side project',
    published: '2026-10-05',
    related: {
      useCases: ['x-launch-video', 'tiktok-app-promo', 'what-i-shipped-video'],
      recipes: ['retro-terminal', 'y2k-chrome'],
    },
  },
];

export const guideBySlug = (slug: string) => GUIDES.find(g => g.slug === slug);
