// The Animation panel for a film or an overlay: how it comes in, goes out, and moves all along
// (In, Out, Combo), picked from the motion presets. Each tile plays its animation on a card, so it
// can be seen before it's picked; the duration of the one picked can be changed.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ANIM_KINDS, NO_ANIM, poseAt, type AnimKind, type ClipAnim } from '@/domain/effects/animation';
import { presetsIn } from '@/domain/effects/library';
import type { Preset } from '@/domain/effects/presets';
import { Icon, I } from './icons';

const KIND_NAMES: Record<AnimKind, string> = { in: 'In', out: 'Out', combo: 'Combo' };

// the most an in or out can take (s)
const MAX_DUR = 5;

export function AnimSheet({
  anim,
  length,
  onPick,
  onDuration,
  onClose,
}: {
  anim: ClipAnim;
  length: number; // the clip's (s): an in or out takes at most this long
  onPick(kind: AnimKind, preset: Preset | null): void;
  onDuration(kind: AnimKind, seconds: number): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState<AnimKind>('in');
  const presets = presetsIn('motion').find(c => c.category.toLowerCase() === kind)?.presets ?? [];
  const slot = anim[kind];
  const dur = slot ? (slot.params.duration as number) : 0;
  const most = Math.max(0.1, Math.min(MAX_DUR, length));
  return (
    <div className="sheet" role="dialog" aria-label="Animation">
      <div className="sheet-head">
        <strong>Animation</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="sheet-tabs" role="tablist" aria-label="Kind">
        {ANIM_KINDS.map(k => (
          <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => setKind(k)}>
            {KIND_NAMES[k]}
            {anim[k] ? ' •' : ''}
          </button>
        ))}
      </div>
      <div className="tiles" role="group" aria-label={`${KIND_NAMES[kind]} animations`}>
        <button type="button" className="tile" aria-pressed={!slot} onClick={() => onPick(kind, null)}>
          <span className="tile-art anim-art">
            <Icon d={I.remove} size={28} />
          </span>
          None
        </button>
        {presets.map(p => (
          <button
            key={p.id}
            type="button"
            className="tile"
            aria-pressed={slot?.preset === p.id}
            onClick={() => onPick(kind, p)}
          >
            <AnimArt preset={p} kind={kind} />
            {p.name}
          </button>
        ))}
      </div>
      {slot && kind !== 'combo' && (
        <div className="sliders">
          <label className="slider">
            <span>Duration</span>
            <input
              type="range"
              min={0.1}
              max={most}
              step={0.05}
              value={Math.min(dur, most)}
              style={
                { '--p': `${((Math.min(dur, most) - 0.1) / (most - 0.1 || 1)) * 100}%` } as CSSProperties
              }
              onChange={e => onDuration(kind, +e.target.value)}
            />
            <output>{dur.toFixed(1)}s</output>
          </label>
        </div>
      )}
    </div>
  );
}

// a card playing the preset's animation over and over: coming in then holding, holding then going
// out, or moving all along
function AnimArt({ preset, kind }: { preset: Preset; kind: AnimKind }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.animate) return;
    const anim = { ...NO_ANIM, [kind]: { preset: preset.id, params: preset.passes[0].params } };
    const dur = kind === 'combo' ? 0 : (preset.passes[0].params.duration as number);
    const hold = 0.7,
      len = kind === 'combo' ? 2.5 : dur + hold;
    const frames = Array.from({ length: 31 }, (_, k) => {
      const t = (k / 30) * len;
      const p = poseAt(anim, t, len);
      return {
        offset: k / 30,
        transform: `translate(${(p.x * 100).toFixed(1)}%, ${(p.y * 100).toFixed(1)}%) rotate(${p.rot.toFixed(3)}rad) scale(${p.scale.toFixed(3)})`,
        opacity: Math.max(0, Math.min(1, p.alpha)),
        filter: `blur(${(p.blur * 56).toFixed(1)}px)`,
      };
    });
    const a = el.animate(frames, { duration: len * 1000, iterations: Infinity });
    return () => a.cancel();
  }, [preset, kind]);
  return (
    <span className="tile-art anim-art">
      <span ref={ref} className="anim-card" />
    </span>
  );
}
