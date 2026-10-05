// The /create tool's composition root: builds the browser adapters and plugs them into the Studio.
// The heavy adapters (the Anthropic SDK, the MP4 encoder) load only when first used.
import type { Director, ExportJob, Exporter } from '@/application/promo/ports';
import { Studio } from '@/application/promo/studio';
import type { Aspect } from '@/domain/promo/plan';
import { MusicTrack } from '@/infrastructure/promo/music';
import { ShotStore } from '@/infrastructure/promo/shots';
import { HttpSubscriber } from '@/infrastructure/promo/subscribe';
import { FONT_FAMILIES } from '@/components/engine/recipeFonts';

export interface StudioRuntime {
  studio: Studio;
  shots: ShotStore;
  music: MusicTrack;
  // thumbnails for the screenshots, by shot id
  thumbs: Map<string, string>;
  addFiles(files: File[]): Promise<number>;
  removeShot(id: string): void;
  setMusicFile(file: File | null): Promise<void>;
}

export function createStudioRuntime(start: { recipe?: string; aspect?: Aspect } = {}): StudioRuntime {
  const shots = new ShotStore();
  const music = new MusicTrack();
  const thumbs = new Map<string, string>();

  const director: Director = {
    async direct(req) {
      const { AnthropicDirector } = await import('@/infrastructure/promo/anthropicDirector');
      return new AnthropicDirector(shots, () => studio.getState().recipe).direct(req);
    },
  };

  const exporter: Exporter = {
    async supported() {
      if (typeof VideoEncoder === 'undefined') return false;
      const { Mp4Exporter } = await import('@/infrastructure/promo/export/mp4');
      return new Mp4Exporter(shots, music, () => FONT_FAMILIES).supported();
    },
    async export(job: ExportJob, progress: (done: number) => void) {
      const { Mp4Exporter } = await import('@/infrastructure/promo/export/mp4');
      return new Mp4Exporter(shots, music, () => FONT_FAMILIES).export(job, progress);
    },
  };

  const studio: Studio = new Studio(
    {
      director,
      exporter,
      subscriber: new HttpSubscriber(),
      newSeed: () => Math.floor(Math.random() * 2 ** 31),
    },
    start,
  );

  return {
    studio,
    shots,
    music,
    thumbs,
    async addFiles(files) {
      const added = await shots.add(files);
      const kept = studio.addShots(added);
      for (const a of added) {
        if (kept.includes(a.shot.id)) thumbs.set(a.shot.id, URL.createObjectURL(a.file));
        else shots.remove(a.shot.id);
      }
      // a first plan as soon as there's something to show
      if (!studio.getState().plan && studio.canDirect()) studio.directAuto();
      return kept.length;
    },
    removeShot(id) {
      studio.removeShot(id);
      shots.remove(id);
      const url = thumbs.get(id);
      if (url) URL.revokeObjectURL(url);
      thumbs.delete(id);
    },
    async setMusicFile(file) {
      if (!file) {
        music.clear();
        studio.setMusic(null);
        return;
      }
      await music.load(file);
      studio.setMusic({ name: file.name, bpm: studio.getState().music?.bpm ?? null });
    },
  };
}
