'use client';

// The end of the premiere: the screen goes white and waits for your film. Drop screenshots on it
// (or pick them) and the tool opens with them loaded. Nothing is uploaded.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { handOff } from '@/components/create/handoff';
import { CtaLink } from '@/components/site/CtaLink';

export function DropScreen() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [landed, setLanded] = useState(false);

  const take = (files: FileList | null) => {
    const images = [...(files ?? [])].filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    setLanded(true);
    handOff(images.slice(0, 6));
    // a beat for the "landed" animation, then into the tool
    setTimeout(() => router.push('/create'), 450);
  };

  return (
    <div className="wrap drop-end">
      <div
        className={`drop-screen${over ? ' over' : ''}${landed ? ' landed' : ''}`}
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
        <p className="label">Reel 05 · yours</p>
        <h2>Your film here.</h2>
        <p>Drop 3–6 screenshots on the screen. They stay in this browser.</p>
        <div className="hero-ctas">
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            Choose screenshots
          </button>
          <CtaLink href="/create" className="btn btn-ghost-dark">
            Make my video
          </CtaLink>
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
