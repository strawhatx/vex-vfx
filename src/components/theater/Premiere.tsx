'use client';

// The signature moment: one screenshot on the big screen, re-cut in four styles as you scroll
// (Clean → Y2K Chrome → Brutalist → Swiss Minimal), each change of reel marked by a projector
// flicker. It's the real engine playing, not a recording. The reels are also tabs, so keyboard and
// reduced-motion visitors pick them directly. It ends on an empty screen that takes your own.
import { useCallback, useEffect, useRef, useState } from 'react';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import { gsap, reducedMotion, ScrollTrigger } from '@/components/site/motion';
import type { Aspect } from '@/domain/promo/plan';
import { DropScreen } from './DropScreen';

export interface Reel {
  slug: string;
  name: string;
  line: string;
}

export function Premiere({ reels }: { reels: Reel[] }) {
  const [active, setActive] = useState(0);
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [flick, setFlick] = useState(0);
  const pin = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);

  const show = useCallback((i: number) => {
    if (i === activeRef.current) return;
    activeRef.current = i;
    setActive(i);
    setFlick(f => f + 1);
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

  // scroll drives the reels while the screen is pinned
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

  // the projector flicker on a change of reel
  useEffect(() => {
    if (!flick || reducedMotion()) return;
    gsap.fromTo('.reel-gate', { opacity: 0.9 }, { opacity: 0, duration: 0.4, ease: 'steps(4)' });
    gsap.fromTo('.premiere-screen .frame', { x: -3 }, { x: 0, duration: 0.4, ease: 'steps(6)' });
  }, [flick]);

  const reel = reels[active];
  return (
    <section className="premiere" id="premiere" aria-labelledby="premiere-title">
      <div className="premiere-pin" ref={pin}>
        <div className="wrap premiere-grid">
          <div className="premiere-copy">
            <p className="label">The premiere</p>
            <h2 id="premiere-title">One screenshot. Four films.</h2>
            <p className="muted">
              The same screen, directed four ways. Every style is a recipe of colour, type, motion and cuts;
              pick one and your screenshots get the whole treatment.
            </p>
            <div className="reels" role="tablist" aria-label="Styles" ref={tabs}>
              {reels.map((r, i) => (
                <button
                  key={r.slug}
                  role="tab"
                  id={`reel-tab-${r.slug}`}
                  aria-selected={i === active}
                  aria-controls="reel-panel"
                  className="reel-tab"
                  onClick={() => show(i)}
                >
                  <span className="label">Reel {String(i + 1).padStart(2, '0')}</span>
                  <strong>{r.name}</strong>
                  <span className="reel-line">{r.line}</span>
                </button>
              ))}
            </div>
          </div>
          <div
            className="premiere-screen"
            id="reel-panel"
            role="tabpanel"
            aria-labelledby={`reel-tab-${reel.slug}`}
          >
            <div className={`frame frame-${aspect === '9:16' ? 'tall' : 'wide'}`}>
              <EnginePlayer
                key={`${reel.slug}-${aspect}`}
                recipe={reel.slug}
                aspect={aspect}
                mode="loop"
                single
                scenesOnly
                className="frame-canvas"
                label={`The Orbit demo screenshot as a ${reel.name} promo video`}
              />
              <div className="reel-gate" aria-hidden="true" />
            </div>
            <p className="label reel-tag" aria-live="polite">
              Reel {String(active + 1).padStart(2, '0')} · {reel.name} · {aspect}
            </p>
          </div>
        </div>
      </div>
      <DropScreen />
    </section>
  );
}
