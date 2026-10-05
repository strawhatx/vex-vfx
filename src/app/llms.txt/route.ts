import { COMPETITORS } from '@/domain/promo/content/competitors';
import { HOME_FAQ } from '@/domain/promo/content/faq';
import { GUIDES } from '@/domain/promo/content/guides';
import { USE_CASES } from '@/domain/promo/content/useCases';
import { RECIPES } from '@/domain/promo/recipes';
import { SITE, absolute } from '@/lib/seo/site';

export const dynamic = 'force-static';

// A plain summary for AI search tools: what PromoReel is, in quotable sentences, and where to read more.
export function GET() {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    'PromoReel is a free web tool for indie developers and founders. You pick a visual style, drop in 3–6 screenshots of your app, add its name, tagline and URL, and an AI director plans a 10–45 second promo video: the hook, scene order, camera move for each scene, zoom targets and captions. The video renders and exports as an MP4 (9:16 or 16:9) entirely in the browser using WebCodecs. Screenshots are never uploaded. There is no signup; an email is asked for before download.',
    '',
    'AI direction works three ways: copy a generated prompt into Claude, ChatGPT or Gemini and paste the JSON plan back; use your own Anthropic API key (called from the browser); or use the built-in rule-based director with no AI. Every plan is validated before it plays.',
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
