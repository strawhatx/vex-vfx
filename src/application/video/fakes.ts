// In-memory stand-ins for the ports, for tests.
import type { ExportJob, Exporter, Project, ProjectStore, Subscriber } from './ports';

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

export class MemoryStore implements ProjectStore {
  saves = 0;
  constructor(public project: Project | null = null) {}
  load() {
    return this.project ? structuredClone(this.project) : null;
  }
  save(p: Project) {
    this.saves++;
    this.project = structuredClone(p);
  }
}
