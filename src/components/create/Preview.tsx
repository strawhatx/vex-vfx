'use client';

// The live preview: the same engine as the export, seeked on every animation frame. Play, pause and
// scrub; the music (if any) plays along from the same point.
import { useEffect, useMemo, useRef, useState } from 'react';
import { totalSeconds, type Plan } from '@/domain/video/plan';
import { loadImage, type ImageLike } from '@/infrastructure/video/canvas';
import { Engine } from '@/infrastructure/video/engine/engine';
import { recipeBySlug } from '@/domain/video/recipes';
import { FONT_FAMILIES, loadRecipeFonts } from '@/components/engine/recipeFonts';

interface Props {
  plan: Plan;
  logo: string | null;
  musicUrl: string | null;
}

const SIZE: Record<Plan['format'], [number, number]> = {
  '9:16': [540, 960],
  '1:1': [720, 720],
  '16:9': [960, 540],
};

export function Preview({ plan, logo, musicUrl }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const engine = useRef<Engine | null>(null);
  const clock = useRef({ t: 0, last: 0 });
  // the scrubber and time label follow playback directly (no React render per frame)
  const range = useRef<HTMLInputElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const duration = useMemo(() => totalSeconds(plan), [plan]);
  const [playing, setPlaying] = useState(false);
  const [logoImg, setLogoImg] = useState<{ url: string; img: ImageLike } | null>(null);

  // the logo, decoded once per change
  useEffect(() => {
    if (!logo) return;
    let alive = true;
    loadImage(logo)
      .then(img => alive && setLogoImg({ url: logo, img }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [logo]);
  const img = logo && logoImg?.url === logo ? logoImg.img : null;

  // (re)load the plan into the engine whenever it changes, and redraw where we are
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const [w, h] = SIZE[plan.format];
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    engine.current ??= new Engine(c, FONT_FAMILIES);
    const e = engine.current;
    e.load({ plan, logo: img });
    clock.current.t = Math.min(clock.current.t, e.duration);
    e.render(clock.current.t);
    let alive = true;
    const r = recipeBySlug(plan.aesthetic);
    if (r) loadRecipeFonts([r]).then(() => alive && e.render(clock.current.t));
    return () => {
      alive = false;
    };
  }, [plan, img]);

  // a new example, style or format starts playing (not every edit; never with reduced motion). Set
  // while rendering when it changes, React's pattern for state that follows a prop.
  const take = `${plan.aesthetic}|${plan.format}|${plan.scenes.map(s => s.type).join(',')}`;
  const [shownTake, setShownTake] = useState('');
  if (take !== shownTake) {
    setShownTake(take);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
  }

  // the play loop
  useEffect(() => {
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

  const shape = plan.format === '9:16' ? 'tall' : plan.format === '1:1' ? 'square' : 'wide';
  return (
    <div className="preview">
      <div className={`preview-frame ${shape}`}>
        <canvas ref={canvas} role="img" aria-label="Preview of your video" />
      </div>
      <div className="transport">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setPlaying(p => !p)}
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
