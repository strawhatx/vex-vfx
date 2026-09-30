// Films kept in this browser's IndexedDB, so a project's page opens it again: its edits in one
// record, and its videos and music as files of their own, each written once (a film saves every
// few seconds while it's worked on; its files don't change). Files a film no longer uses are
// dropped when it's saved. Each film also has a small record of its name, when it was saved and
// a picture of it, for listing films without reading them all. Nothing leaves the device.
import type { FilmInfo, FilmStore } from '@/application/ports';
import type { SavedFilm } from '@/application/project';
import { FILES, FILMS, INFO, done, openDb, request } from './db';

// a film as it's kept: its files by key rather than the files themselves
type Kept = Omit<SavedFilm, 'reels' | 'music'> & {
  reels: (Omit<SavedFilm['reels'][number], 'file'> & { file: string })[];
  music: (Omit<SavedFilm['music'][number], 'file'> & { file: string })[];
};

export class IndexedDbFilmStore implements FilmStore {
  // the key each file is kept under (files opened from here, or saved already)
  private keys = new WeakMap<Blob, string>();

  async load(id: string): Promise<SavedFilm | null> {
    try {
      const db = await this.open();
      const kept = await request<Kept | undefined>(db.transaction(FILMS).objectStore(FILMS).get(id));
      if (!kept) return null;
      const files = db.transaction(FILES).objectStore(FILES);
      const file = async (key: string) => {
        const blob = await request<Blob | undefined>(files.get(key));
        if (!blob) throw new Error(`missing file ${key}`);
        this.keys.set(blob, key);
        return blob;
      };
      const reels = await Promise.all(kept.reels.map(async r => ({ ...r, file: await file(r.file) })));
      const music = await Promise.all(kept.music.map(async m => ({ ...m, file: await file(m.file) })));
      return { ...kept, reels, music };
    } catch {
      return null;
    }
  }

  async save(id: string, film: SavedFilm, info: Omit<FilmInfo, 'id'>) {
    const db = await this.open();
    const keyOf = (blob: Blob) => {
      let key = this.keys.get(blob);
      if (!key) this.keys.set(blob, (key = `${id}/${crypto.randomUUID()}`));
      return key;
    };
    const kept: Kept = {
      ...film,
      reels: film.reels.map(r => ({ ...r, file: keyOf(r.file) })),
      music: film.music.map(m => ({ ...m, file: keyOf(m.file) })),
    };
    const used = new Map([...film.reels, ...film.music].map(x => [keyOf(x.file), x.file]));
    const tx = db.transaction([FILMS, FILES, INFO], 'readwrite');
    const files = tx.objectStore(FILES);
    // this film's files there already: new ones are added, ones it no longer uses dropped
    const had = new Set(
      (await request<IDBValidKey[]>(files.getAllKeys(IDBKeyRange.bound(`${id}/`, `${id}/\uffff`)))).map(
        String,
      ),
    );
    for (const [key, blob] of used) if (!had.has(key)) files.put(blob, key);
    for (const key of had) if (!used.has(key)) files.delete(key);
    tx.objectStore(FILMS).put(kept, id);
    tx.objectStore(INFO).put({ ...info, id }, id);
    await done(tx);
  }

  async list(): Promise<FilmInfo[]> {
    try {
      const db = await this.open();
      const all = await request<FilmInfo[]>(db.transaction(INFO).objectStore(INFO).getAll());
      return all.sort((a, b) => b.savedAt - a.savedAt);
    } catch {
      return [];
    }
  }

  async remove(id: string) {
    const db = await this.open();
    const tx = db.transaction([FILMS, FILES, INFO], 'readwrite');
    tx.objectStore(FILMS).delete(id);
    tx.objectStore(INFO).delete(id);
    tx.objectStore(FILES).delete(IDBKeyRange.bound(`${id}/`, `${id}/\uffff`));
    await done(tx);
  }

  private open() {
    return openDb();
  }
}
