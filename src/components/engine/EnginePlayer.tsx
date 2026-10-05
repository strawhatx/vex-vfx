'use client';

// The video engine on a page: plays a demo plan on a canvas. "loop" plays while on screen; "hover"
// plays while its tile is hovered or focused and otherwise shows a still. Rendering pauses off
// screen and in background tabs; with reduced motion it only ever draws a still.
import { useEffect, useRef } from 'react';
import type { Aspect } from '@/domain/promo/plan';
import { recipeBySlug } from '@/domain/promo/recipes';
import { Engine } from '@/infrastructure/promo/engine/engine';
import { schedule } from '@/domain/promo/schedule';
import { DEMO_PRODUCT, demoImages, demoPlan } from './demo';
import { FONT_FAMILIES, loadRecipeFonts } from './recipeFonts';

export interface EnginePlayerProps {
  recipe: string;
  aspect: Aspect;
  mode: 'loop' | 'hover';
  // one screenshot through several moves (the signature) instead of all four
  single?: boolean;
  // skip the hook and outro: loop the scenes only
  scenesOnly?: boolean;
  // the short side's resolution cap (px)
  maxShort?: number;
  className?: string;
  label: string;
  onCanvas?: (c: HTMLCanvasElement | null) => void;
}

export function EnginePlayer({
  recipe,
  aspect,
  mode,
  single,
  scenesOnly,
  maxShort = 720,
  className,
  label,
  onCanvas,
}: EnginePlayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const r = recipeBySlug(recipe);
    if (!canvas || !r) return;
    onCanvas?.(canvas);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const plan = demoPlan(r, aspect, single);
    const { spans, duration } = schedule(plan);
    const from = scenesOnly ? spans[1].start : 0;
    const to = scenesOnly ? spans[spans.length - 1].start : duration;
    // a still from late in the first scene, once its caption has fully appeared
    const still = spans[1].start + (spans[1].end - spans[1].start) * 0.85;
    const engine = new Engine(canvas, FONT_FAMILIES);
    let alive = true,
      playing = false,
      visible = false,
      raf = 0,
      startedAt = 0;

    const size = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const short = Math.min(maxShort, Math.round(Math.min(box.width, box.height) * dpr)) || 360;
      const [w, h] =
        aspect === '9:16' ? [short, Math.round((short * 16) / 9)] : [Math.round((short * 16) / 9), short];
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const drawStill = () => {
      size();
      engine.render(still);
    };
    const frame = (now: number) => {
      if (!alive || !playing || !visible) return;
      if (!startedAt) startedAt = now;
      const t = from + (((now - startedAt) / 1000) % (to - from));
      engine.render(t);
      raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (reduced || playing) return;
      playing = true;
      startedAt = 0;
      if (visible) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      playing = false;
      cancelAnimationFrame(raf);
      drawStill();
    };

    // fonts and screenshots first, then the first frame
    Promise.all([demoImages(), loadRecipeFonts([r])]).then(([shots]) => {
      if (!alive) return;
      engine.load({ plan, recipe: r, product: DEMO_PRODUCT, brand: '#2F6BFF', shots });
      drawStill();
      if (mode === 'loop') play();
    });

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && playing) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => engine.duration && !playing && drawStill());
    ro.observe(canvas);
    const onVis = () =>
      document.hidden
        ? cancelAnimationFrame(raf)
        : visible && playing && (raf = requestAnimationFrame(frame));
    document.addEventListener('visibilitychange', onVis);

    // hover mode: the nearest tile (or the canvas) starts and stops it
    const host = (canvas.closest('[data-preview]') as HTMLElement | null) ?? canvas;
    if (mode === 'hover') {
      host.addEventListener('pointerenter', play);
      host.addEventListener('pointerleave', stop);
      host.addEventListener('focusin', play);
      host.addEventListener('focusout', stop);
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.removeEventListener('pointerenter', play);
      host.removeEventListener('pointerleave', stop);
      host.removeEventListener('focusin', play);
      host.removeEventListener('focusout', stop);
      onCanvas?.(null);
    };
  }, [recipe, aspect, mode, single, scenesOnly, maxShort, onCanvas]);

  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}
