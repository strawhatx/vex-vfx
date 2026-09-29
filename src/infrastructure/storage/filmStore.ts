// Films kept in this browser's IndexedDB, so a project's page opens it again: its edits in one
// record, and its videos and music as files of their own, each written once (a film saves every
// few seconds while it's worked on; its files don't change). Files a film no longer uses are
// dropped when it's saved. Nothing leaves the device.
import type { FilmStore } from '@/application/ports';
import type { SavedFilm } from '@/application/project';

const DB = 'flarecut',
  VERSION = 1,
  FILMS = 'films',
  FILES = 'files';

// a film as it's kept: its files by key rather than the files themselves
type Kept = Omit<SavedFilm, 'reels' | 'music'> & {
  reels: (Omit<SavedFilm['reels'][number], 'file'> & { file: string })[];
  music: (Omit<SavedFilm['music'][number], 'file'> & { file: string })[];
};

export class IndexedDbFilmStore implements FilmStore {
  private db: Promise<IDBDatabase> | null = null;
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

  async save(id: string, film: SavedFilm) {
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
    const tx = db.transaction([FILMS, FILES], 'readwrite');
    const files = tx.objectStore(FILES);
    // this film's files there already: new ones are added, ones it no longer uses dropped
    const had = new Set(
      (await request<IDBValidKey[]>(files.getAllKeys(IDBKeyRange.bound(`${id}/`, `${id}/￿`)))).map(String),
    );
    for (const [key, blob] of used) if (!had.has(key)) files.put(blob, key);
    for (const key of had) if (!used.has(key)) files.delete(key);
    tx.objectStore(FILMS).put(kept, id);
    await done(tx);
  }

  private open() {
    if (this.db) return this.db;
    // (asks the browser not to clear what's kept when space runs short; it may say no)
    void navigator.storage?.persist?.().catch(() => false);
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILMS)) db.createObjectStore(FILMS);
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
}

const request = <T>(r: IDBRequest) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
