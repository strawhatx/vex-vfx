'use client';

// The /create tool: pick a style, add screenshots and details, direct, preview and edit, export.
// All state lives in the Studio (application layer); this component turns clicks into calls on it.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { RECIPES } from '@/domain/promo/recipes';
import { findUseCase } from '@/domain/promo/content/useCases';
import { ASPECTS, type Aspect } from '@/domain/promo/plan';
import { DirectPanel } from './DirectPanel';
import { ExportPanel } from './ExportPanel';
import { takeHandOff } from './handoff';
import { PlanEditor } from './PlanEditor';
import { Preview } from './Preview';
import { ShotsPanel } from './ShotsPanel';
import { StylePicker } from './StylePicker';
import { createStudioRuntime } from './studioStore';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'my-product';

export function CreateApp() {
  const [rt] = useState(() => createStudioRuntime());
  const { studio } = rt;
  const s = useSyncExternalStore(studio.subscribe, studio.getState, studio.getState);
  const [bpmText, setBpmText] = useState('');

  // ?style=…&aspect=…&for=… from the SEO pages, and screenshots dropped on the home page's screen
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const style = q.get('style');
    if (style) studio.pick(style);
    const aspect = q.get('aspect');
    const useCase = findUseCase(q.get('for') ?? '');
    if (useCase) {
      studio.setPurpose(useCase.purpose, useCase.seconds);
      studio.setAspect(useCase.aspect);
    }
    if (aspect && (ASPECTS as string[]).includes(aspect)) studio.setAspect(aspect as Aspect);
    const handed = takeHandOff();
    if (handed) {
      if (handed.recipe) studio.pick(handed.recipe);
      void rt.addFiles(handed.files);
    }
  }, [rt, studio]);

  // (memoized so the preview only reloads when the picture changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- playable() is derived from exactly these
  const plan = useMemo(() => studio.playable(), [studio, s.plan, s.aspect, s.music]);
  const shotIds = useMemo(() => s.shots.map(x => x.id), [s.shots]);
  const thumbOf = (shot: number) => rt.thumbs.get(s.shots[shot]?.id ?? '');

  return (
    <div className="studio">
      <div className="studio-steps">
        <section className="panel" aria-labelledby="step-style">
          <h2 id="step-style">
            <span className="step-n">1</span> Pick a style
          </h2>
          <StylePicker recipes={RECIPES} value={s.recipe.slug} onPick={slug => studio.pick(slug)} />
        </section>

        <section className="panel" aria-labelledby="step-shots">
          <h2 id="step-shots">
            <span className="step-n">2</span> Add screenshots
          </h2>
          <ShotsPanel
            shots={s.shots}
            thumbs={rt.thumbs}
            product={s.product}
            brand={studio.brand()}
            sampled={s.sampled}
            overridden={!!s.brandOverride}
            onFiles={files => rt.addFiles(files)}
            onRemove={id => rt.removeShot(id)}
            onMove={(a, b) => studio.moveShot(a, b)}
            onProduct={p => studio.setProduct(p)}
            onBrand={hex => studio.setBrand(hex)}
          />
        </section>

        <section className="panel" aria-labelledby="step-direct">
          <h2 id="step-direct">
            <span className="step-n">3</span> Direct
          </h2>
          <DirectPanel
            prompt={() => studio.prompt()}
            busy={s.busy === 'directing'}
            canDirect={s.shots.length > 0}
            source={s.source}
            onAuto={() => studio.directAuto(true)}
            onPaste={text => studio.directPaste(text)}
            onApi={key => void studio.directApi(key)}
          />
        </section>
      </div>

      <div className="studio-stage">
        <section className="panel stage-panel" aria-labelledby="step-preview">
          <div className="stage-head">
            <h2 id="step-preview">
              <span className="step-n">4</span> Preview
            </h2>
            <div className="seg" role="radiogroup" aria-label="Aspect ratio">
              {ASPECTS.map(a => (
                <button
                  key={a}
                  role="radio"
                  aria-checked={s.aspect === a}
                  onClick={() => studio.setAspect(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {s.notice && (
            <div className={`notice ${s.notice.tone}`} role="status">
              <p>{s.notice.text}</p>
              {s.notice.fixes && (
                <details>
                  <summary>What we changed</summary>
                  <ul>
                    {s.notice.fixes.map(f => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <Preview
            plan={plan}
            recipe={s.recipe}
            product={s.product}
            brand={studio.brand()}
            shotIds={shotIds}
            shots={rt.shots}
            musicUrl={rt.music.url}
          />

          {plan && (
            <>
              <div className="stage-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void studio.redirect()}
                  disabled={s.busy !== null}
                >
                  ↻ Re-direct
                </button>
                <label className="btn btn-sm file-btn">
                  {s.music ? `♪ ${s.music.name}` : '♪ Add music'}
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={e => void rt.setMusicFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {s.music && (
                  <>
                    <label className="bpm">
                      <span>BPM</span>
                      <input
                        inputMode="numeric"
                        value={bpmText}
                        placeholder="120"
                        onChange={e => {
                          setBpmText(e.target.value);
                          const n = Number(e.target.value);
                          studio.setBpm(n >= 40 && n <= 240 ? n : null);
                        }}
                      />
                    </label>
                    <button type="button" className="btn btn-sm" onClick={() => void rt.setMusicFile(null)}>
                      Remove music
                    </button>
                  </>
                )}
              </div>
              <PlanEditor
                plan={plan}
                thumbs={thumbOf}
                onHook={t => studio.editHook(t)}
                onCaption={(i, t) => studio.editCaption(i, t)}
                onMove={(a, b) => studio.moveScene(a, b)}
                onRemove={i => studio.removeScene(i)}
              />
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="step-export">
          <h2 id="step-export">
            <span className="step-n">5</span> Download
          </h2>
          <ExportPanel
            ready={!!plan}
            busy={s.busy === 'exporting'}
            progress={s.progress}
            fileName={`${slugify(s.product.name)}-promoreel-${s.aspect.replace(':', 'x')}.mp4`}
            onExport={email => studio.exportVideo(email)}
          />
        </section>
      </div>
    </div>
  );
}
