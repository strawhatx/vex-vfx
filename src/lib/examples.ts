import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, type Example } from '@/domain/video/content/examples';

// Example videos are files in public/examples (made with the tool itself). A page only shows,
// and the sitemap only lists, the ones that exist.
const has = (file: string) => existsSync(join(process.cwd(), 'public', 'examples', file));

export const exampleFiles = (e: Example) => ({
  video: `/examples/${e.slug}.mp4`,
  poster: `/examples/${e.slug}.jpg`,
});

export const availableExamples = (): Example[] =>
  EXAMPLES.filter(e => has(`${e.slug}.mp4`) && has(`${e.slug}.jpg`));
