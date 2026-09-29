// The browser's IndexedDB database everything kept on this device lives in, and small helpers for
// its requests. Stores: films (their edits), files (their videos and music), info (for listing
// them), packs (the library of effect videos).
export const FILMS = 'films',
  FILES = 'files',
  INFO = 'info',
  PACKS = 'packs';

const NAME = 'flarecut',
  VERSION = 3;

let db: Promise<IDBDatabase> | null = null;

export function openDb() {
  if (db) return db;
  // (asks the browser not to clear what's kept when space runs short; it may say no)
  void navigator.storage?.persist?.().catch(() => false);
  db = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const store of [FILMS, FILES, INFO, PACKS])
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

export const request = <T>(r: IDBRequest) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });

export const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
