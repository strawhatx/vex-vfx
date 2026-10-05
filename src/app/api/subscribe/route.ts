import { addSubscriber } from '@/server/buttondown';
import { allow } from '@/server/rateLimit';
import { SubscribeBody } from '@/server/schema';

// POST { email, source, company } → adds the email to the newsletter. Validated, rate-limited,
// and answered with generic messages; details go to the server log.
export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (!allow(ip))
    return Response.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 });

  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 2000) return Response.json({ ok: false, error: 'Bad request.' }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }
  const parsed = SubscribeBody.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: 'Enter a valid email.' }, { status: 400 });
  // a bot filled the honeypot: pretend it worked
  if (parsed.data.company) return Response.json({ ok: true });

  try {
    const ok = await addSubscriber(parsed.data.email, parsed.data.source);
    return Response.json({ ok }, { status: ok ? 200 : 502 });
  } catch (e) {
    console.error('[subscribe] failed', e);
    return Response.json({ ok: false, error: 'Something went wrong.' }, { status: 502 });
  }
}
