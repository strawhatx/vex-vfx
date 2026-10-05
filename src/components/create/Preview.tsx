'use client';

// The live preview: the same engine as the export, seeked on every animation frame. Play, pause and
// scrub; the music (if any) plays along from the same point.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plan } from '@/domain/promo/plan';
import type { Product } from '@/domain/promo/product';
import type { Recipe } from '@/domain/promo/recipe';
import { totalSeconds } from '@/domain/promo/schedule';
import { Engine } from '@/infrastructure/promo/engine/engine';
import type { ShotStore } from '@/infrastructure/promo/shots';
import { FONT_FAMILIES, loadRecipeFonts } from '@/components/engine/recipeFonts';

interface Props {
  plan: Plan | null;
  recipe: Recipe;
  product: Product;
  brand: string;
  shotIds: string[];
  shots: ShotStore;
  musicUrl: string | null;
}

export function Preview({ plan, recipe, product, brand, shotIds, shots, musicUrl }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const engine = useRef<Engine | null>(null);
  const clock = useRef({ t: 0, playing: false, last: 0 });
  // the scrubber and time label follow playback directly (no React render per frame)
  const range = useRef<HTMLInputElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const duration = useMemo(() => (plan ? totalSeconds(plan) : 0), [plan]);
  const [playing, setPlaying] = useState(false);

  // (re)load the plan into the engine whenever anything that changes the picture changes
  useEffect(() => {
    const c = canvas.current;
    if (!c || !plan) return;
    const [w, h] = plan.aspect === '9:16' ? [540, 960] : [960, 540];
    c.width = w;
    c.height = h;
    engine.current ??= new Engine(c, FONT_FAMILIES);
    const e = engine.current;
    e.load({ plan, recipe, product, brand, shots: shotIds.map(id => shots.get(id)!).filter(Boolean) });
    clock.current.t = Math.min(clock.current.t, e.duration);
    e.render(clock.current.t);
    let alive = true;
    loadRecipeFonts([recipe]).then(() => alive && e.render(clock.current.t));
    return () => {
      alive = false;
    };
  }, [plan, recipe, product, brand, shotIds, shots]);

  // a new take starts playing (not every edit; and not at all with reduced motion). Set while
  // rendering when the take changes, React's pattern for state that follows a prop.
  const take = plan ? `${plan.hook.text}|${plan.scenes.map(x => `${x.shot}${x.move}`).join(',')}` : '';
  const [shownTake, setShownTake] = useState(take);
  if (take !== shownTake) {
    setShownTake(take);
    if (take && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
  }

  // the play loop
  useEffect(() => {
    clock.current.playing = playing;
    const a = audio.current;
    if (!playing) {
      a?.pause();
      return;
    }
    if (a && musicUrl) {
      a.currentTime = clock.current.t;
      void a.play().catch(() => {});
    }
    let raf = 0;
    clock.current.last = performance.now();
    const step = (now: number) => {
      const e = engine.current;
      if (!e) return;
      const c = clock.current;
      c.t += (now - c.last) / 1000;
      c.last = now;
      if (c.t >= e.duration) {
        c.t = 0;
        if (a && musicUrl) a.currentTime = 0;
      }
      e.render(c.t);
      show(c.t, e.duration);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, musicUrl]);

  function show(t: number, d: number) {
    if (range.current) range.current.value = String(t);
    if (label.current) label.current.textContent = `${t.toFixed(1)}s / ${d.toFixed(1)}s`;
  }

  const seek = (v: number) => {
    clock.current.t = v;
    show(v, engine.current?.duration ?? 0);
    engine.current?.render(v);
    if (audio.current && musicUrl) audio.current.currentTime = v;
  };

  const tall = plan?.aspect !== '16:9';
  return (
    <div className="preview">
      <div className={`preview-frame ${tall ? 'tall' : 'wide'}`}>
        <canvas ref={canvas} role="img" aria-label="Preview of your video" />
        {!plan && (
          <div className="preview-empty">
            <p className="label">Reel 00</p>
            <p>Your preview appears here as soon as you add a screenshot.</p>
          </div>
        )}
      </div>
      <div className="transport">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setPlaying(p => !p)}
          disabled={!plan}
          aria-pressed={playing}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          ref={range}
          type="range"
          min={0}
          max={duration || 1}
          step={1 / 30}
          defaultValue={0}
          onChange={e => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          disabled={!plan}
          aria-label="Scrub through the video"
        />
        <span className="label tc" ref={label}>
          0.0s / {duration.toFixed(1)}s
        </span>
      </div>
      {musicUrl && <audio ref={audio} src={musicUrl} preload="auto" />}
    </div>
  );
}
