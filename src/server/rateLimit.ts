import 'server-only';

// A fixed-window rate limit in memory: enough for one free-tier instance. Each serverless instance
// keeps its own counts, so it slows abuse rather than stopping it outright.
const hits = new Map<string, { n: number; until: number }>();

export function allow(key: string, limit = 5, windowMs = 10 * 60_000, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.until <= now) {
    hits.set(key, { n: 1, until: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
    return true;
  }
  h.n++;
  return h.n <= limit;
}
