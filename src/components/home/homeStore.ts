// The start page's way to the films kept on this device (its composition root, like the editor's
// player.ts): listing them, and forgetting one.
import type { FilmStore } from '@/application/ports';
import { IndexedDbFilmStore } from '@/infrastructure/storage/filmStore';

export const films: FilmStore = new IndexedDbFilmStore();
