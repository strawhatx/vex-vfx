'use client';

// The theatre's motion: a short intro on the first visit (house lights dim, curtains draw back,
// the projector flickers on; under 1.6s, any input skips it), the curtains opening fully as you
// scroll, and the 3D projector beam on devices that can afford it. The headline never moves.
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { gsap, reducedMotion } from '@/components/site/motion';

const Auditorium3D = dynamic(() => import('./Auditorium3D'), { ssr: false });

const SEEN = 'promoreel:intro';

function capable() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (reducedMotion() || nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) < 4 || window.innerWidth < 700) return false;
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function TheaterFx() {
  const [beam, setBeam] = useState(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.theater');
    if (!root || reducedMotion()) return;
    const ctx = gsap.context(() => {
      // the intro, once a session
      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN) === '1';
        sessionStorage.setItem(SEEN, '1');
      } catch {
        // storage blocked: just play it
      }
      if (!seen) {
        const rest = parseFloat(getComputedStyle(root).getPropertyValue('--open')) || 0.8;
        const intro = gsap.timeline({
          defaults: { ease: 'reel' },
          // hand the curtains back to the stylesheet (its value differs by screen size)
          onComplete: () => root.style.removeProperty('--open'),
        });
        intro
          .fromTo(root, { '--open': 0.62 }, { '--open': rest, duration: 1.4 }, 0)
          .fromTo('.house-lights', { opacity: 0.55 }, { opacity: 0, duration: 1.2 }, 0)
          .fromTo('.screen', { '--lamp': 0.82 }, { '--lamp': 1, duration: 0.5, ease: 'steps(5)' }, 0.25);
        const skip = () => intro.progress(1);
        ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(e =>
          window.addEventListener(e, skip, { once: true, passive: true }),
        );
      }
      // scrolling away: the curtains open the rest of the way and the screen comes closer
      gsap.fromTo(
        root,
        { '--open-scroll': 0 },
        {
          '--open-scroll': 1,
          ease: 'none',
          scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
        },
      );
      gsap.to('.screen-wrap', {
        scale: 1.06,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, root);

    // the 3D beam after the page is idle
    const idle =
      (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ??
      ((f: () => void) => setTimeout(f, 1200));
    idle(() => capable() && setBeam(true));
    return () => ctx.revert();
  }, []);

  return beam ? <Auditorium3D /> : null;
}
