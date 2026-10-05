'use client';

// Step 2: the screenshots (drop, pick, reorder, remove) and the product's details. The note about
// privacy sits right by the drop zone, where the question comes up.
import { useRef, useState } from 'react';
import type { Shot } from '@/application/promo/studio';
import { MAX_SHOTS } from '@/application/promo/studio';
import { PRODUCT_LIMITS, type Product } from '@/domain/promo/product';
import { TextField } from './TextField';

interface Props {
  shots: Shot[];
  thumbs: Map<string, string>;
  product: Product;
  brand: string;
  sampled: string | null;
  overridden: boolean;
  onFiles: (files: File[]) => Promise<number>;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onProduct: (p: Partial<Product>) => void;
  onBrand: (hex: string | null) => void;
}

export function ShotsPanel(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [landed, setLanded] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  const take = async (list: FileList | null) => {
    const n = await p.onFiles([...(list ?? [])]);
    if (n) setLanded(x => x + 1);
  };

  return (
    <div className="panel-body">
      <div
        key={landed}
        className={`dropzone${over ? ' over' : ''}${landed ? ' landed' : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
      >
        <p>
          <strong>Drop 3–6 screenshots here</strong>
          <span className="muted"> or </span>
          <button type="button" className="link-btn" onClick={() => input.current?.click()}>
            choose files
          </button>
        </p>
        <p className="private-note">
          <span aria-hidden="true">●</span> Your screenshots stay in this browser. They’re never uploaded.
        </p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => void take(e.target.files)}
          aria-label="Choose screenshots"
        />
      </div>

      {p.shots.length > 0 && (
        <ol className="shots" aria-label="Your screenshots, in order">
          {p.shots.map((s, i) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (drag != null) p.onMove(drag, i);
                setDrag(null);
              }}
              className={drag === i ? 'dragging' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable image */}
              <img src={p.thumbs.get(s.id)} alt={`Screenshot ${i + 1}: ${s.name}`} />
              <span className="label">{i + 1}</span>
              <div className="shot-actions">
                <button
                  type="button"
                  onClick={() => p.onMove(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move screenshot ${i + 1} earlier`}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => p.onMove(i, i + 1)}
                  disabled={i === p.shots.length - 1}
                  aria-label={`Move screenshot ${i + 1} later`}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => p.onRemove(s.id)}
                  aria-label={`Remove screenshot ${i + 1}`}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="hint">
        {p.shots.length}/{MAX_SHOTS} screenshots
        {p.shots.length > 0 && p.shots.length < 3 ? '. 3 or more make a better video.' : '.'}
      </p>

      <div className="fields">
        <label>
          <span>Product name</span>
          <TextField
            value={p.product.name}
            maxLength={PRODUCT_LIMITS.name}
            onValue={name => p.onProduct({ name })}
            placeholder="Orbit"
            autoComplete="off"
          />
        </label>
        <label>
          <span>One-line tagline</span>
          <TextField
            value={p.product.tagline}
            maxLength={PRODUCT_LIMITS.tagline}
            onValue={tagline => p.onProduct({ tagline })}
            placeholder="Changelogs that write themselves"
            autoComplete="off"
          />
        </label>
        <label>
          <span>URL</span>
          <TextField
            value={p.product.url}
            maxLength={PRODUCT_LIMITS.url}
            onValue={url => p.onProduct({ url })}
            placeholder="orbit.dev"
            inputMode="url"
            autoComplete="off"
          />
        </label>
        <div className="brand-row">
          <label>
            <span>Brand colour</span>
            <input type="color" value={p.brand} onChange={e => p.onBrand(e.target.value)} />
          </label>
          <p className="hint">
            {p.overridden ? (
              <button type="button" className="link-btn" onClick={() => p.onBrand(null)}>
                Use the colour from your screenshots
              </button>
            ) : p.sampled ? (
              'Picked from your screenshots.'
            ) : (
              'The style’s accent, until your screenshots give us one.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
