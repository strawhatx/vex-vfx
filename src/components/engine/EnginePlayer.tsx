'use client';

// The video engine on a page: plays an example plan on a canvas. "loop" plays while on screen;
// "hover" plays while its tile is hovered or focused and otherwise shows a still. Rendering pauses
// off screen and in background tabs; with reduced motion it only ever draws a still.
import { useEffect, useRef } from 'react';
import type { Format } from '@/domain/video/plan';
import { schedule } from '@/domain/video/schedule';
import { Engine } from '@/infrastructure/video/engine/engine';
import { demoPlan } from './demo';
import { FONT_FAMILIES, loadRecipeFonts } from './recipeFonts';
import { recipeBySlug } from '@/domain/video/recipes';

export interface EnginePlayerProps {
  recipe: string;
  format: Format;
  mode: 'loop' | 'hover';
  // which example plan to play
  example?: string;
  // the short side's resolution cap (px)
  maxShort?: number;
  className?: string;
  label: string;
}

export function EnginePlayer({
  recipe,
  format,
  mode,
  example = 'orbit-launch',
  maxShort = 720,
  className,
  label,
}: EnginePlayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const r = recipeBySlug(recipe);
    if (!canvas || !r) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const plan = demoPlan(example, recipe, format);
    const { spans, duration } = schedule(plan);
    // a still from late in a busy scene (the third, or the last there is)
    const pick = spans[Math.min(2, spans.length - 2)];
    const still = pick.start + (pick.end - pick.start) * 0.85;
    const engine = new Engine(canvas, FONT_FAMILIES);
    let alive = true,
      ready = false,
      playing = false,
      visible = false,
      raf = 0,
      startedAt = 0;

    const size = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const short = Math.min(maxShort, Math.round(Math.min(box.width, box.height) * dpr)) || 360;
      const long = Math.round((short * 16) / 9);
      const [w, h] = format === '9:16' ? [short, long] : format === '16:9' ? [long, short] : [short, short];
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const drawStill = () => {
      if (!ready) return;
      size();
      engine.render(still);
    };
    const frame = (now: number) => {
      if (!alive || !playing || !visible) return;
      if (!startedAt) startedAt = now;
      engine.render(((now - startedAt) / 1000) % duration);
      raf = requestAnimationFrame(frame);
    };
    const play = () => {
      if (reduced || playing || !ready) return;
      playing = true;
      startedAt = 0;
      size();
      if (visible) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      playing = false;
      cancelAnimationFrame(raf);
      drawStill();
    };

    // fonts first, then the first frame
    loadRecipeFonts([r]).then(() => {
      if (!alive) return;
      engine.load({ plan, logo: null });
      ready = true;
      drawStill();
      if (mode === 'loop') play();
    });

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && playing) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => !playing && drawStill());
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
      engine.dispose();
    };
  }, [recipe, format, mode, example, maxShort]);

  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}
