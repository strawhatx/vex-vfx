'use client';

// The signature moment: one product's video, restyled live as you scroll (Clean Soft → Y2K Chrome →
// Swiss Minimal → Brutalist). It's the real engine playing, not a recording. The styles are also a
// row of tabs, so keyboard and reduced-motion visitors pick them directly. It ends by asking for
// yours.
import { useCallback, useEffect, useRef, useState } from 'react';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import { gsap, reducedMotion, ScrollTrigger } from '@/components/site/motion';
import type { Format } from '@/domain/video/plan';
import { TryYours } from './TryYours';

export interface Reel {
  slug: string;
  name: string;
  line: string;
}

export function Showcase({ reels }: { reels: Reel[] }) {
  const [active, setActive] = useState(0);
  const [aspect, setAspect] = useState<Format>('16:9');
  const [changes, setChanges] = useState(0);
  const pin = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);

  const show = useCallback((i: number) => {
    if (i === activeRef.current) return;
    activeRef.current = i;
    setActive(i);
    setChanges(c => c + 1);
    // keep the active tab in view when the tabs scroll sideways (phones), without moving the page
    const list = tabs.current,
      tab = list?.children[i] as HTMLElement | undefined;
    if (list && tab && list.scrollWidth > list.clientWidth)
      list.scrollTo({ left: tab.offsetLeft - list.offsetLeft - 16, behavior: 'smooth' });
  }, []);

  // phones get the vertical cut
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const set = () => setAspect(mq.matches ? '9:16' : '16:9');
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  // scroll drives the styles while the stage is pinned
  useEffect(() => {
    if (!pin.current || reducedMotion()) return;
    const st = ScrollTrigger.create({
      trigger: pin.current,
      start: 'top top',
      end: `+=${reels.length * 90}%`,
      pin: true,
      anticipatePin: 1,
      onUpdate: self => show(Math.min(reels.length - 1, Math.floor(self.progress * reels.length))),
    });
    return () => st.kill();
  }, [reels.length, show]);

  // a soft crossfade on each change of style
  useEffect(() => {
    if (!changes || reducedMotion()) return;
    gsap.fromTo(
      '.showcase .stage-frame',
      { opacity: 0.35, scale: 0.985 },
      { opacity: 1, scale: 1, duration: 0.6 },
    );
  }, [changes]);

  const reel = reels[active];
  return (
    <section className="showcase" id="styles" aria-labelledby="showcase-title">
      <div className="showcase-pin" ref={pin}>
        <div className="wrap showcase-head">
          <p className="kicker">One video.</p>
          <h2 id="showcase-title">Every style.</h2>
          <div className="segmented" role="tablist" aria-label="Styles" ref={tabs}>
            {reels.map((r, i) => (
              <button
                key={r.slug}
                role="tab"
                id={`reel-tab-${r.slug}`}
                aria-selected={i === active}
                aria-controls="reel-panel"
                onClick={() => show(i)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <div
          className="wrap-wide showcase-stage"
          id="reel-panel"
          role="tabpanel"
          aria-labelledby={`reel-tab-${reel.slug}`}
        >
          <div className={`stage-frame ${aspect === '9:16' ? 'tall' : 'wide'}`}>
            <EnginePlayer
              key={`${reel.slug}-${aspect}`}
              recipe={reel.slug}
              format={aspect}
              example={aspect === '9:16' ? 'orbit-launch' : 'orbit-feature'}
              mode="loop"
              label={`A launch video for Orbit, a demo app, in the ${reel.name} style`}
            />
          </div>
          <p className="stage-caption" aria-live="polite">
            <strong>{reel.name}.</strong> {reel.line[0].toUpperCase() + reel.line.slice(1)}.
          </p>
        </div>
      </div>
      <TryYours />
    </section>
  );
}
