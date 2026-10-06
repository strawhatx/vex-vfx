// What the editor needs from the outside, named by what it does. The browser adapters in
// infrastructure/video implement these; tests use the fakes in fakes.ts.
import type { Plan } from '@/domain/video/plan';

// the work in progress: the plan, the logo (a data: URL, kept with the project), and which example
// it started from
export interface Project {
  plan: Plan;
  logo: string | null;
  example: string;
}

// saves the project on this device (free projects never leave the browser)
export interface ProjectStore {
  load(): Project | null;
  save(project: Project): void;
}

export interface ExportJob {
  plan: Plan;
  logo: string | null;
}

// renders a plan to an MP4, frame by frame
export interface Exporter {
  // whether this browser can encode video at all
  supported(): Promise<boolean>;
  export(job: ExportJob, progress: (done: number) => void): Promise<Blob>;
}

// adds an email to the newsletter; false if that failed (the download goes ahead anyway)
export interface Subscriber {
  subscribe(email: string, source: string): Promise<boolean>;
}
