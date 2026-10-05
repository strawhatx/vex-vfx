'use client';

// Step 5: an email for the download, then the MP4 is made right here, frame by frame.
import { useEffect, useState } from 'react';

interface Props {
  ready: boolean;
  busy: boolean;
  progress: number;
  fileName: string;
  onExport: (email: string) => Promise<Blob | null>;
}

const EMAIL_STORE = 'promoreel:email';

export function ExportPanel({ ready, busy, progress, fileName, onExport }: Props) {
  // (the studio runs only in the browser, so these can be read up front)
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_STORE) ?? '';
    } catch {
      return '';
    }
  });
  const [url, setUrl] = useState<string | null>(null);
  const [encoder] = useState(() => typeof VideoEncoder !== 'undefined');
  const [phone] = useState(() => window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blob = await onExport(email);
    if (!blob) return;
    try {
      localStorage.setItem(EMAIL_STORE, email.trim());
    } catch {
      // ignore
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    const a = document.createElement('a');
    a.href = next;
    a.download = fileName;
    a.click();
  };

  if (!encoder)
    return (
      <p className="notice warn" role="status">
        This browser can’t make video files. Use a recent Chrome, Safari or Firefox to export; the preview
        still works here.
      </p>
    );

  return (
    <form className="panel-body export" onSubmit={submit}>
      {phone && <p className="hint">Exporting works on phones, but it’s quicker on a desktop.</p>}
      <label className="field-block">
        <span>Email for your download</span>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <p className="hint">We’ll send the occasional update when new styles ship. One click unsubscribes.</p>
      <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
        {busy ? `Rendering… ${Math.round(progress * 100)}%` : 'Download MP4'}
      </button>
      {busy && <progress max={1} value={progress} aria-label="Export progress" />}
      {url && !busy && (
        <p className="done" role="status">
          Done.{' '}
          <a href={url} download={fileName} className="link">
            Download again
          </a>
          . Post it, and tag it #MadeWithPromoReel.
        </p>
      )}
    </form>
  );
}
