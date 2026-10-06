// The project, saved in this browser's storage. Free projects never leave the device. A logo is
// kept as a small data: URL with the plan (the editor shrinks it first), so one save holds it all.
import type { Project, ProjectStore } from '@/application/video/ports';

const KEY = 'promoreel:project:v2';

export class LocalProjectStore implements ProjectStore {
  load(): Project | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Project) : null;
    } catch {
      return null;
    }
  }

  save(project: Project) {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
    } catch {
      // storage full or blocked: the editor keeps working, it just won't survive a reload
    }
  }
}
