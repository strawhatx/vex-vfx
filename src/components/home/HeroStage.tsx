'use client';

// The hero's "product shot": a promo for the demo app, made live by the same engine as the tool.
// Vertical on phones, wide elsewhere; the frame's size is set in CSS so nothing shifts.
import { useEffect, useState } from 'react';
import { EnginePlayer } from '@/components/engine/EnginePlayer';
import type { Aspect } from '@/domain/promo/plan';

export function HeroStage() {
  const [aspect, setAspect] = useState<Aspect | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const set = () => setAspect(mq.matches ? '9:16' : '16:9');
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);
  return (
    <div className="wrap-wide hero-stage">
      <div className="stage-frame">
        {aspect && (
          <EnginePlayer
            key={aspect}
            recipe="clean-apple"
            aspect={aspect}
            mode="loop"
            maxShort={aspect === '16:9' ? 720 : 540}
            label="A promo video for Orbit, a demo app, made from four screenshots"
          />
        )}
      </div>
    </div>
  );
}
