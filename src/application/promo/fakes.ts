// In-memory stand-ins for the ports, for tests.
import type { Director, ExportJob, Exporter, Subscriber } from './ports';

export class FakeDirector implements Director {
  calls: { prompt: string; shotIds: string[]; apiKey: string }[] = [];
  constructor(public reply: string | Error = '{}') {}
  async direct(req: { prompt: string; shotIds: string[]; apiKey: string }) {
    this.calls.push(req);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}

export class FakeExporter implements Exporter {
  jobs: ExportJob[] = [];
  constructor(
    public canEncode = true,
    public fail = false,
  ) {}
  async supported() {
    return this.canEncode;
  }
  async export(job: ExportJob, progress: (d: number) => void) {
    this.jobs.push(job);
    progress(0.5);
    if (this.fail) throw new Error('encoder died');
    progress(1);
    return new Blob(['mp4'], { type: 'video/mp4' });
  }
}

export class FakeSubscriber implements Subscriber {
  emails: string[] = [];
  constructor(public ok = true) {}
  async subscribe(email: string) {
    this.emails.push(email);
    if (!this.ok) throw new Error('newsletter down');
    return true;
  }
}

// seeds 1, 2, 3, …
export const counter = () => {
  let n = 0;
  return () => ++n;
};
