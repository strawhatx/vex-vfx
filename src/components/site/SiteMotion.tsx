'use client';

// The marketing pages' motion, all in one place: smooth scrolling (Lenis, kept in step with
// ScrollTrigger), reveals as sections scroll in, and split headlines.
// Everything is visible in the HTML first: a reveal only sets its start state on elements still
// below the fold, just before animating them in. With reduced motion, none of this runs.
import Lenis from 'lenis';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { gsap, reducedMotion, ScrollTrigger, SplitText } from './motion';

export function SiteMotion() {
  const path = usePathname();

  // smooth scroll, once
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({ duration: 1.1, easing: t => 1 - Math.pow(1 - t, 3) });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis');
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      document.documentElement.classList.remove('lenis');
    };
  }, []);

  // reveals and split headlines, per page
  useEffect(() => {
    if (reducedMotion()) return;
    const below = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;
    const ctx = gsap.context(() => {
      gsap.utils
        .toArray<HTMLElement>('[data-split]')
        .filter(below)
        .forEach(el => {
          const split = SplitText.create(el, { type: 'words', mask: 'words' });
          gsap.from(split.words, {
            yPercent: 110,
            stagger: 0.06,
            duration: 0.8,
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
            onComplete: () => split.revert(),
          });
        });
      gsap.utils
        .toArray<HTMLElement>('[data-reveal]')
        .filter(below)
        .forEach(el => {
          gsap.from(el, {
            y: 32,
            opacity: 0,
            duration: 0.8,
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          });
        });
    });
    return () => ctx.revert();
  }, [path]);

  return null;
}
