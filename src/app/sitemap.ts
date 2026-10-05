import type { MetadataRoute } from 'next';
import { COMPETITORS } from '@/domain/promo/content/competitors';
import { GUIDES } from '@/domain/promo/content/guides';
import { USE_CASES } from '@/domain/promo/content/useCases';
import { RECIPES } from '@/domain/promo/recipes';
import { availableExamples, exampleFiles } from '@/lib/examples';
import { absolute } from '@/lib/seo/site';

// every indexable page, with a video entry for each example video
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority = 0.6, extra: Partial<MetadataRoute.Sitemap[number]> = {}) => ({
    url: absolute(path),
    changeFrequency: 'monthly' as const,
    priority,
    ...extra,
  });
  const examples = availableExamples();
  const videosFor = (filter: (recipe: string) => boolean) =>
    examples
      .filter(e => filter(e.recipe))
      .map(e => ({
        title: e.title,
        description: e.description,
        thumbnail_loc: absolute(exampleFiles(e).poster),
        content_loc: absolute(exampleFiles(e).video),
        duration: Math.round(e.seconds),
        publication_date: e.uploadDate,
      }));

  return [
    page('/', 1),
    page('/create', 0.9),
    page('/aesthetics', 0.7),
    ...RECIPES.map(r => page(`/aesthetics/${r.slug}`, 0.7, { videos: videosFor(s => s === r.slug) })),
    page('/for', 0.7),
    ...USE_CASES.map(u => page(`/for/${u.slug}`, 0.8)),
    page('/guides', 0.6),
    ...GUIDES.map(g => page(`/guides/${g.slug}`, 0.6, { lastModified: g.published })),
    page('/examples', 0.6, { videos: videosFor(() => true) }),
    page('/alternatives', 0.4),
    ...COMPETITORS.map(c => page(`/alternatives/${c.slug}`, 0.5)),
    page('/privacy', 0.3),
  ];
}
