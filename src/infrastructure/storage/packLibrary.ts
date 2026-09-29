// The library of effect videos, kept in this browser's IndexedDB with each video's file, for any
// project to use. Nothing leaves the device.
import type { PackLibrary } from '@/application/ports';
import type { PackItem } from '@/domain/project/effectClips';
import { PACKS, done, openDb, request } from './db';

interface Kept {
  item: PackItem;
  file: Blob;
  picture: Blob | null;
  added: number; // ms since 1970
}

export class IndexedDbPackLibrary implements PackLibrary {
  async list() {
    try {
      const db = await openDb();
      const all = await request<Kept[]>(db.transaction(PACKS).objectStore(PACKS).getAll());
      return all
        .sort((a, b) => b.added - a.added)
        .map(({ item, file, picture }) => ({ item, file, picture }));
    } catch {
      return [];
    }
  }

  async add(item: PackItem, file: Blob, picture: Blob | null) {
    const db = await openDb();
    const tx = db.transaction(PACKS, 'readwrite');
    tx.objectStore(PACKS).put({ item, file, picture, added: Date.now() } satisfies Kept, item.id);
    await done(tx);
  }

  async remove(id: string) {
    const db = await openDb();
    const tx = db.transaction(PACKS, 'readwrite');
    tx.objectStore(PACKS).delete(id);
    await done(tx);
  }
}
