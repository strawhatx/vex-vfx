// Sends the email to our one server route, which adds it to the newsletter.
import type { Subscriber } from '@/application/video/ports';

export class HttpSubscriber implements Subscriber {
  async subscribe(email: string, source: string) {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source, company: '' }),
    });
    return res.ok;
  }
}
