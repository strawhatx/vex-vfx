// The /create tool's composition root: builds the browser adapters and plugs them into the Editor.
// The MP4 encoder loads only when first used.
import type { ExportJob, Exporter } from '@/application/video/ports';
import { Editor } from '@/application/video/editor';
import type { Format } from '@/domain/video/plan';
import { LocalProjectStore } from '@/infrastructure/video/localProjects';
import { MusicTrack } from '@/infrastructure/video/music';
import { HttpSubscriber } from '@/infrastructure/video/subscribe';
import { FONT_FAMILIES } from '@/components/engine/recipeFonts';

export interface EditorRuntime {
  editor: Editor;
  music: MusicTrack;
  setMusicFile(file: File | null): Promise<void>;
}

export function createEditorRuntime(
  start: { example?: string; aesthetic?: string; format?: Format } = {},
): EditorRuntime {
  const music = new MusicTrack();

  const exporter: Exporter = {
    async supported() {
      if (typeof VideoEncoder === 'undefined') return false;
      const { Mp4Exporter } = await import('@/infrastructure/video/export/mp4');
      return new Mp4Exporter(music, () => FONT_FAMILIES).supported();
    },
    async export(job: ExportJob, progress: (done: number) => void) {
      const { Mp4Exporter } = await import('@/infrastructure/video/export/mp4');
      return new Mp4Exporter(music, () => FONT_FAMILIES).export(job, progress);
    },
  };

  const editor = new Editor(
    { exporter, subscriber: new HttpSubscriber(), store: new LocalProjectStore() },
    start,
  );

  return {
    editor,
    music,
    async setMusicFile(file) {
      if (!file) return music.clear();
      await music.load(file);
    },
  };
}
