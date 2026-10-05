import { describe, expect, it } from 'vitest';
import { allow } from './rateLimit';
import { SubscribeBody } from './schema';

describe('subscribe input', () => {
  it('accepts an email, trimmed and lowercased', () => {
    const r = SubscribeBody.safeParse({ email: '  Dev@Example.COM ', source: 'create' });
    expect(r.success && r.data.email).toBe('dev@example.com');
  });

  it('refuses junk', () => {
    expect(SubscribeBody.safeParse({ email: 'nope' }).success).toBe(false);
    expect(SubscribeBody.safeParse({ email: 'a@b.co', source: '<script>' }).success).toBe(false);
  });
});

describe('rate limit', () => {
  it('allows 5 per window per key, then resets', () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allow('ip-a', 5, 1000, t)).toBe(true);
    expect(allow('ip-a', 5, 1000, t)).toBe(false);
    expect(allow('ip-b', 5, 1000, t)).toBe(true);
    expect(allow('ip-a', 5, 1000, t + 1001)).toBe(true);
  });
});
