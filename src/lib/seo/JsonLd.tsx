// Structured data for search engines, as JSON in a script tag. React writes a script's text as is,
// so the JSON goes in as text (with "<" escaped so it can never close the tag); no raw HTML.
import type { Thing, WithContext } from './schema';

export function JsonLd({ data }: { data: WithContext<Thing> | WithContext<Thing>[] }) {
  return <script type="application/ld+json">{JSON.stringify(data).replace(/</g, '\\u003c')}</script>;
}
