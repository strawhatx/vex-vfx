import { describe, expect, it } from 'vitest';
import { extractJson } from './parse';

describe('extractJson', () => {
  it('reads JSON from a fenced reply with prose around it', () => {
    const text = 'Here is your plan:\n```json\n{ "v": 1, "scenes": [{ "shot": 0 }] }\n```\nEnjoy!';
    expect(extractJson(text)).toEqual({ v: 1, scenes: [{ shot: 0 }] });
  });

  it('reads bare JSON with trailing commas and smart quotes', () => {
    expect(extractJson('Sure! {“v”: 1, "a": [1,2,],}')).toEqual({ v: 1, a: [1, 2] });
  });

  it('respects braces inside strings', () => {
    expect(extractJson('{"t": "a } b", "n": 2} trailing {')).toEqual({ t: 'a } b', n: 2 });
  });

  it('returns null without a JSON object', () => {
    expect(extractJson('I cannot see the screenshots.')).toBeNull();
    expect(extractJson('{ broken')).toBeNull();
  });
});
