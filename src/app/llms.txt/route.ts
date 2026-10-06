import { COMPETITORS } from '@/domain/video/content/competitors';
import { HOME_FAQ } from '@/domain/video/content/faq';
import { GUIDES } from '@/domain/video/content/guides';
import { USE_CASES } from '@/domain/video/content/useCases';
import { RECIPES } from '@/domain/video/recipes';
import { SITE, absolute } from '@/lib/seo/site';

export const dynamic = 'force-static';

// A plain summary for AI search tools: what PromoReel is, in quotable sentences, and where to read more.
export function GET() {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    'PromoReel is a free web tool for indie developers and founders that makes launch videos for software products out of motion graphics: kinetic typography, stat counters, progress rings, card timelines and logo reveals, in the product’s brand. You pick one of five styles, start from an example plan, put in your product, logo, brand colour and real numbers, edit every scene, and download an MP4 (9:16, 1:1 or 16:9). The video is drawn and encoded entirely in the browser; projects are saved on the device. No signup; an email is asked for before download.',
    '',
    'Coming next: describe your product and an AI (your own Gemini or Claude key) writes the script and fills the scenes. The AI never generates pixels or invents numbers; every number in a video is one the user gave or confirmed.',
    '',
    '## Key pages',
    `- [Make a video](${absolute('/create')}): the tool`,
    `- [Styles](${absolute('/aesthetics')}): ${RECIPES.map(r => r.name).join(', ')}`,
    ...RECIPES.map(r => `- [${r.name}](${absolute(`/aesthetics/${r.slug}`)}): ${r.page.description}`),
    '',
    '## Launch video specs by platform',
    ...USE_CASES.map(u => `- [${u.name}](${absolute(`/for/${u.slug}`)}): ${u.answer}`),
    '',
    '## Guides',
    ...GUIDES.map(g => `- [${g.title}](${absolute(`/guides/${g.slug}`)}): ${g.description}`),
    '',
    '## Comparisons',
    ...COMPETITORS.map(c => `- [${c.name} alternative](${absolute(`/alternatives/${c.slug}`)})`),
    '',
    '## FAQ',
    ...HOME_FAQ.flatMap(x => [`### ${x.q}`, x.a, '']),
    `Privacy: ${absolute('/privacy')}`,
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
