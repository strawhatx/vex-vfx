'use client';

// Step 3: who directs. No AI (the rules, instant), Copy prompt (paste into the chat you already use,
// then paste the plan back), or Your API key (sent from this browser straight to Anthropic).
import { useState } from 'react';
import type { DirectMode } from '@/application/promo/studio';

const KEY_STORE = 'promoreel:anthropic-key';

interface Props {
  prompt: () => string;
  busy: boolean;
  canDirect: boolean;
  source: DirectMode | null;
  onAuto: () => void;
  onPaste: (text: string) => void;
  onApi: (key: string) => void;
}

export function DirectPanel(p: Props) {
  const [tab, setTab] = useState<DirectMode>('auto');
  const [pasted, setPasted] = useState('');
  // (the studio runs only in the browser, so storage can be read up front)
  const [key, setKey] = useState(() => stored(KEY_STORE));
  const [remember, setRemember] = useState(() => !!stored(KEY_STORE));
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.prompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const useKey = () => {
    try {
      if (remember) localStorage.setItem(KEY_STORE, key.trim());
      else localStorage.removeItem(KEY_STORE);
    } catch {
      // ignore
    }
    p.onApi(key);
  };

  const tabs: { id: DirectMode; label: string }[] = [
    { id: 'auto', label: 'No AI' },
    { id: 'paste', label: 'Copy prompt' },
    { id: 'api', label: 'Your API key' },
  ];

  return (
    <div className="panel-body">
      <div className="tabs" role="tablist" aria-label="How to direct">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            id={`dir-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`dir-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'auto' && (
        <div role="tabpanel" id="dir-panel-auto" aria-labelledby="dir-auto" className="tabpanel">
          <p>
            Rules pick the order, moves, zooms and captions from your style. Instant, and you can edit
            everything after.
          </p>
          <button type="button" className="btn btn-primary" onClick={p.onAuto} disabled={!p.canDirect}>
            {p.source === 'auto' ? 'New take' : 'Direct it'}
          </button>
        </div>
      )}

      {tab === 'paste' && (
        <div role="tabpanel" id="dir-panel-paste" aria-labelledby="dir-paste" className="tabpanel">
          <ol className="steps-small">
            <li>
              <button type="button" className="btn btn-sm" onClick={copy} disabled={!p.canDirect}>
                {copied ? 'Copied' : 'Copy the prompt'}
              </button>
            </li>
            <li>Paste it into Claude, ChatGPT or Gemini and attach your screenshots in the same order.</li>
            <li>Paste the JSON it sends back here.</li>
          </ol>
          <label className="field-block">
            <span className="visually-hidden">The plan from your AI</span>
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              rows={6}
              placeholder='{ "v": 1, "hook": … }'
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => p.onPaste(pasted)}
            disabled={!p.canDirect || !pasted.trim()}
          >
            Use this plan
          </button>
        </div>
      )}

      {tab === 'api' && (
        <div role="tabpanel" id="dir-panel-api" aria-labelledby="dir-api" className="tabpanel">
          <p>
            Claude looks at your screenshots and directs the video. Your key is used from this browser to call
            Anthropic directly. <strong>Your key never touches our servers.</strong>
          </p>
          <label className="field-block">
            <span>Anthropic API key</span>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            Remember it in this browser
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={useKey}
            disabled={!p.canDirect || !key.trim() || p.busy}
          >
            {p.busy ? 'Directing…' : 'Direct with Claude'}
          </button>
          <p className="hint">Uses your Anthropic account; a video costs a few cents.</p>
        </div>
      )}
    </div>
  );
}

// a remembered value, or '' if there's none or storage is blocked
function stored(name: string): string {
  try {
    return localStorage.getItem(name) ?? '';
  } catch {
    return '';
  }
}
