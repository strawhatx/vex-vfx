// Pulls the plan's JSON out of whatever was pasted back from a chat: a code fence, a sentence before
// or after it, smart quotes. Returns the parsed value, or null if there's no JSON object in it.

export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const start = body.indexOf('{');
  if (start < 0) return null;
  // the first balanced { … } (strings respected)
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1'));
      } catch {
        return null;
      }
    }
  }
  return null;
}
