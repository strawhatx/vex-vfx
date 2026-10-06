'use client';

// Step 2: what to start from (an example plan) and the product's details: name, URL, brand colour,
// logo, and whether to show subtitles. The logo stays in this browser with the project.
import { useRef, useState } from 'react';
import type { Example } from '@/domain/video/examples';
import type { Plan } from '@/domain/video/plan';
import { logoDataUrl } from '@/infrastructure/video/logo';
import { TextField } from './TextField';

interface Props {
  examples: readonly Example[];
  example: string;
  plan: Plan;
  logo: string | null;
  // the style's own accent, shown until a brand colour is picked
  accent: string;
  rev: number;
  onExample: (id: string) => void;
  onProduct: (p: { name?: string; url?: string }) => void;
  onBrand: (hex: string | null) => void;
  onLogo: (dataUrl: string | null) => void;
  onCaptions: (on: boolean) => void;
}

export function StartPanel(p: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const takeLogo = async (f: File | undefined) => {
    if (!f) return;
    try {
      setLogoError(null);
      p.onLogo(await logoDataUrl(f));
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'That logo couldn’t be read.');
    }
  };

  return (
    <div className="panel-body">
      <fieldset className="choices">
        <legend className="visually-hidden">Start from</legend>
        {p.examples.map(e => (
          <label key={e.id} className={`choice${p.example === e.id ? ' on' : ''}`}>
            <input
              type="radio"
              name="example"
              value={e.id}
              checked={p.example === e.id}
              onChange={() => p.onExample(e.id)}
              className="visually-hidden"
            />
            <strong>{e.title}</strong>
            <span className="hint">{e.describe}</span>
          </label>
        ))}
      </fieldset>

      <div className="fields" key={p.rev}>
        <label>
          <span>Product name</span>
          <TextField
            value={p.plan.product.name}
            maxLength={32}
            onValue={name => p.onProduct({ name })}
            autoComplete="off"
          />
        </label>
        <label>
          <span>URL</span>
          <TextField
            value={p.plan.product.url}
            maxLength={80}
            onValue={url => p.onProduct({ url })}
            inputMode="url"
            autoComplete="off"
            placeholder="yourproduct.com"
          />
        </label>
        <div className="brand-row">
          <label>
            <span>Brand colour</span>
            <input
              type="color"
              value={p.plan.brandColor ?? p.accent}
              onChange={e => p.onBrand(e.target.value)}
            />
          </label>
          <p className="hint">
            {p.plan.brandColor ? (
              <button type="button" className="link-btn" onClick={() => p.onBrand(null)}>
                Use the style’s colour
              </button>
            ) : (
              'The style’s colour, until you pick yours.'
            )}
          </p>
        </div>
        <div className="brand-row">
          <div className="logo-box">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, not an optimizable image */}
            {p.logo ? <img src={p.logo} alt="Your logo" /> : <span className="hint">No logo</span>}
          </div>
          <div className="logo-actions">
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => file.current?.click()}>
              {p.logo ? 'Change logo' : 'Add logo'}
            </button>
            {p.logo && (
              <button type="button" className="link-btn" onClick={() => p.onLogo(null)}>
                Remove
              </button>
            )}
            <p className="hint">SVG looks sharpest. It stays in this browser.</p>
            {logoError && (
              <p className="hint error-text" role="alert">
                {logoError}
              </p>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp"
            hidden
            onChange={e => void takeLogo(e.target.files?.[0])}
            aria-label="Choose a logo"
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={p.plan.captions} onChange={e => p.onCaptions(e.target.checked)} />
          Show subtitles
        </label>
      </div>
    </div>
  );
}
