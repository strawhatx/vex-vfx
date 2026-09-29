'use client';

// The projects kept on this device, the last saved first: each with its picture, its name and when
// it was saved, opening it; and a button to delete it.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FilmInfo } from '@/application/ports';
import { films } from './homeStore';

// how many are shown
const MOST = 12;

// how long ago `at` was, roughly (now: the time now, ms)
export function ago(at: number, now: number) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function RecentProjects() {
  const [list, setList] = useState<(FilmInfo & { url: string | null })[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let urls: string[] = [];
    let gone = false;
    void films.list().then(all => {
      if (gone) return;
      const shown = all
        .slice(0, MOST)
        .map(f => ({ ...f, url: f.picture ? URL.createObjectURL(f.picture) : null }));
      urls = shown.flatMap(f => (f.url ? [f.url] : []));
      setNow(Date.now());
      setList(shown);
    });
    return () => {
      gone = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  async function remove(f: FilmInfo) {
    if (!window.confirm(`Delete “${f.name}”? It can’t be brought back.`)) return;
    await films.remove(f.id);
    setList(cur => cur.filter(x => x.id !== f.id));
  }

  if (!list.length) return null;
  return (
    <section className="recent" aria-label="Recent projects">
      <h2>Recent</h2>
      <ul>
        {list.map(f => (
          <li key={f.id}>
            <Link className="recent-link" href={`/editor/${f.id}`}>
              {f.url ? (
                // (a picture kept on this device: a blob: URL)
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt="" />
              ) : (
                <span className="recent-blank" />
              )}
              <span className="recent-name">{f.name}</span>
              <span className="recent-when">{ago(f.savedAt, now)}</span>
            </Link>
            <button
              type="button"
              className="recent-delete"
              aria-label={`Delete ${f.name}`}
              onClick={() => void remove(f)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
