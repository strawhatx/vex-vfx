'use client';

// After the styles: your turn. Drop screenshots on the card (or pick them) and the tool opens with
// them loaded. Nothing is uploaded.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { handOff } from '@/components/create/handoff';

export function TryYours() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [landed, setLanded] = useState(false);

  const take = (files: FileList | null) => {
    const images = [...(files ?? [])].filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    setLanded(true);
    handOff(images.slice(0, 6));
    setTimeout(() => router.push('/create'), 400);
  };

  return (
    <div className="wrap-wide try">
      <div
        className={`try-card${over ? ' over' : ''}${landed ? ' landed' : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <h2>Now try yours.</h2>
        <p className="muted">Drop 3–6 screenshots here. They stay in this browser.</p>
        <div className="hero-ctas">
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            Choose screenshots
          </button>
          <a className="more" href="/create">
            Open the tool
          </a>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => take(e.target.files)}
          aria-label="Choose screenshots"
        />
      </div>
    </div>
  );
}
