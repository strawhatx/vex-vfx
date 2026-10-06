'use client';

// The /create tool: pick a style, start from an example and set the product's details, edit the
// scenes, preview, and download. All state lives in the Editor (application layer); this component
// turns clicks into calls on it.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { findUseCase } from '@/domain/video/content/useCases';
import { EXAMPLES } from '@/domain/video/examples';
import { FORMATS, FORMAT_LABELS, type Format } from '@/domain/video/plan';
import { RECIPES } from '@/domain/video/recipes';
import { ExportPanel } from './ExportPanel';
import { Preview } from './Preview';
import { ScenesPanel } from './ScenesPanel';
import { StartPanel } from './StartPanel';
import { StylePicker } from './StylePicker';
import { createEditorRuntime } from './studioStore';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'my-product';

// ?style=…&format=…&for=… from the SEO pages
function startFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const useCase = findUseCase(q.get('for') ?? '');
  const format = q.get('format') ?? q.get('aspect');
  return {
    aesthetic: q.get('style') ?? undefined,
    format: (FORMATS as string[]).includes(format ?? '') ? (format as Format) : useCase?.aspect,
  };
}

export function CreateApp() {
  const [rt] = useState(() => createEditorRuntime(startFromUrl()));
  const { editor } = rt;
  const s = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  const [musicName, setMusicName] = useState<string | null>(null);
  const plan = s.project.plan;
  const recipe = editor.recipe();

  // the address stays clean once its settings are in the editor
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  return (
    <div className="studio">
      <div className="studio-steps">
        <section className="panel" aria-labelledby="step-style">
          <h2 id="step-style">
            <span className="step-n">1</span> Pick a style
          </h2>
          <StylePicker recipes={RECIPES} value={plan.aesthetic} onPick={slug => editor.setAesthetic(slug)} />
        </section>

        <section className="panel" aria-labelledby="step-start">
          <h2 id="step-start">
            <span className="step-n">2</span> Start from
          </h2>
          <StartPanel
            examples={EXAMPLES}
            example={s.project.example}
            plan={plan}
            logo={s.project.logo}
            accent={recipe.palette.accent}
            rev={s.rev}
            onExample={id => editor.loadExample(id)}
            onProduct={p => editor.setProduct(p)}
            onBrand={hex => editor.setBrand(hex)}
            onLogo={url => editor.setLogo(url)}
            onCaptions={on => editor.setCaptions(on)}
          />
        </section>

        <section className="panel" aria-labelledby="step-scenes">
          <h2 id="step-scenes">
            <span className="step-n">3</span> Scenes
          </h2>
          <ScenesPanel state={s} editor={editor} recipe={recipe} />
        </section>
      </div>

      <div className="studio-stage">
        <section className="panel stage-panel" aria-labelledby="step-preview">
          <div className="stage-head">
            <h2 id="step-preview">
              <span className="step-n">4</span> Preview
            </h2>
            <div className="seg" role="radiogroup" aria-label="Format">
              {FORMATS.map(f => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={plan.format === f}
                  title={FORMAT_LABELS[f]}
                  onClick={() => editor.setFormat(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {s.notice && (
            <div className={`notice ${s.notice.tone}`} role="status">
              <p>{s.notice.text}</p>
              {s.notice.items && (
                <ul>
                  {s.notice.items.map(f => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Preview plan={plan} logo={s.project.logo} musicUrl={rt.music.url} />

          <div className="stage-actions">
            <label className="btn btn-sm file-btn">
              {musicName ? `♪ ${musicName}` : '♪ Add music'}
              <input
                type="file"
                accept="audio/*"
                hidden
                onChange={async e => {
                  const f = e.target.files?.[0] ?? null;
                  await rt.setMusicFile(f);
                  setMusicName(f?.name ?? null);
                }}
              />
            </label>
            {musicName && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await rt.setMusicFile(null);
                  setMusicName(null);
                }}
              >
                Remove music
              </button>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="step-export">
          <h2 id="step-export">
            <span className="step-n">5</span> Download
          </h2>
          <ExportPanel
            ready
            blockers={editor.blockers()}
            busy={s.busy === 'exporting'}
            progress={s.progress}
            fileName={`${slugify(plan.product.name)}-promoreel-${plan.format.replace(':', 'x')}.mp4`}
            onExport={email => editor.exportVideo(email)}
          />
        </section>
      </div>
    </div>
  );
}
