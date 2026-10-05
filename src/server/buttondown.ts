import 'server-only';

// Adds an email to the Buttondown newsletter. The key is read here, on the server, only.
// "Already subscribed" counts as success.
export async function addSubscriber(email: string, source: string): Promise<boolean> {
  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) {
    console.warn('[subscribe] BUTTONDOWN_API_KEY is not set; skipping', { source });
    return false;
  }
  const res = await fetch('https://api.buttondown.com/v1/subscribers', {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: email, tags: ['promoreel', `from-${source}`] }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) return true;
  const body = await res.text().catch(() => '');
  if (res.status === 409 || (res.status === 400 && /already/i.test(body))) return true;
  console.error('[subscribe] Buttondown error', res.status, body.slice(0, 300));
  return false;
}
