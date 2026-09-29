// The Transition panel for a join between films: how the one ending gives way to the next, picked
// from the transition presets, how long it takes, and the same at every join. Each tile plays the
// transition between two cards.
import { useEffect, useRef, type CSSProperties } from 'react';
import { NO_ANIM, REST_POSE, poseAt, type ClipPose } from '@/domain/effects/animation';
import { ease } from '@/domain/effects/curves';
import { presets } from '@/domain/effects/library';
import type { Preset } from '@/domain/effects/presets';
import { MIN_TRANSITION_S } from '@/domain/project/transitions';
import { Icon, I } from './icons';

export function TransitionSheet({
  current,
  duration,
  most,
  onPick,
  onDuration,
  onEverywhere,
  onClose,
}: {
  current: string | null; // the preset of the transition there
  duration: number;
  most: number; // the longest it can be here (s)
  onPick(presetId: string | null): void;
  onDuration(seconds: number): void;
  onEverywhere(): void;
  onClose(): void;
}) {
  const all = presets().filter(p => p.group === 'transition');
  const d = Math.min(duration, most);
  return (
    <div className="sheet" role="dialog" aria-label="Transition">
      <div className="sheet-head">
        <strong>Transition</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="tiles wrap" role="group" aria-label="Transitions">
        <button type="button" className="tile" aria-pressed={!current} onClick={() => onPick(null)}>
          <span className="tile-art anim-art">
            <Icon d={I.remove} size={28} />
          </span>
          None
        </button>
        {all.map(p => (
          <button
            key={p.id}
            type="button"
            className="tile"
            aria-pressed={current === p.id}
            onClick={() => onPick(p.id)}
          >
            <CutArt preset={p} />
            {p.name}
          </button>
        ))}
      </div>
      {current && (
        <div className="sliders">
          <label className="slider">
            <span>Duration</span>
            <input
              type="range"
              min={MIN_TRANSITION_S}
              max={most}
              step={0.05}
              value={d}
              style={
                {
                  '--p': `${((d - MIN_TRANSITION_S) / (most - MIN_TRANSITION_S || 1)) * 100}%`,
                } as CSSProperties
              }
              onChange={e => onDuration(+e.target.value)}
            />
            <output>{d.toFixed(1)}s</output>
          </label>
          <button type="button" className="sheet-btn" onClick={onEverywhere}>
            Apply to every join
          </button>
        </div>
      )}
    </div>
  );
}

// the transition between two cards, over and over: the first card leaving over the first half
// (with its flash, blur and so on rising), the second arriving over the second
function CutArt({ preset }: { preset: Preset }) {
  const a = useRef<HTMLSpanElement>(null),
    b = useRef<HTMLSpanElement>(null),
    flash = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!a.current?.animate || !b.current || !flash.current) return;
    const move = (kind: 'in' | 'out') => preset.passes.find(p => p.engine === 'motion' && p.kind === kind);
    const screen = (kind: string) =>
      preset.passes.find(p => p.engine === 'screen' && p.kind === kind)?.params ?? null;
    const flashed = screen('flash'),
      blur = Math.max(
        (screen('blur')?.amount as number) ?? 0,
        ((screen('zoomBlur')?.amount as number) ?? 0) * 0.6,
      );
    const hold = 0.5,
      half = 0.35,
      len = hold * 2 + half * 2,
      N = 40;
    const at = (k: number) => (k / N) * len;
    const card = (p: ClipPose, strength: number, shown: boolean) => ({
      transform: `translate(${(p.x * 100).toFixed(1)}%, ${(p.y * 100).toFixed(1)}%) rotate(${p.rot.toFixed(3)}rad) scale(${p.scale.toFixed(3)})`,
      opacity: shown ? Math.max(0, Math.min(1, p.alpha)) : 0,
      filter: `blur(${(blur * strength * 6).toFixed(1)}px)`,
    });
    const frames = { a: [] as Keyframe[], b: [] as Keyframe[], f: [] as Keyframe[] };
    for (let k = 0; k <= N; k++) {
      const t = at(k),
        join = hold + half,
        strength = Math.abs(t - join) < half ? ease('inOut', 1 - Math.abs(t - join) / half) : 0;
      const out = move('out'),
        inn = move('in');
      const pa =
        out && t > hold && t < join
          ? poseAt(
              { ...NO_ANIM, out: { preset: '', params: { ...out.params, duration: half } } },
              t - hold,
              half,
            )
          : REST_POSE;
      const pb =
        inn && t >= join && t < join + half
          ? poseAt(
              { ...NO_ANIM, in: { preset: '', params: { ...inn.params, duration: half } } },
              t - join,
              half,
            )
          : REST_POSE;
      frames.a.push({ offset: k / N, ...card(pa, strength, t < join) });
      frames.b.push({ offset: k / N, ...card(pb, strength, t >= join) });
      frames.f.push({
        offset: k / N,
        opacity: flashed ? strength * (flashed.amount as number) : 0,
        background: (flashed?.color as string) ?? '#fff',
      });
    }
    const opts = { duration: len * 1000, iterations: Infinity };
    const runs = [
      a.current.animate(frames.a, opts),
      b.current.animate(frames.b, opts),
      flash.current.animate(frames.f, opts),
    ];
    return () => runs.forEach(r => r.cancel());
  }, [preset]);
  return (
    <span className="tile-art anim-art">
      <span ref={a} className="cut-card a" />
      <span ref={b} className="cut-card b" />
      <span ref={flash} className="cut-flash" />
    </span>
  );
}
