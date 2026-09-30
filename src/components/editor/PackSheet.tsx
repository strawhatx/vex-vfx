// The panels for effect clips: the library of the user's own effect videos (added from a file,
// picked to place one at the playhead, or taken out), and a placed clip's look: how it's blended
// in, its size, turn and fade (it's moved by dragging it in the preview).
import { useRef, type CSSProperties } from 'react';
import {
  BLENDS,
  MAX_EFFECT_SCALE,
  MIN_EFFECT_SCALE,
  type EffectClip,
  type PackItem,
} from '@/domain/project/effectClips';
import { Icon, I } from './icons';

const pct = (v: number, min: number, max: number) =>
  ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

export function PackSheet({
  packs,
  onAdd,
  onPick,
  onRemove,
  onClose,
}: {
  packs: (PackItem & { picture: string | null })[];
  onAdd(f: File): void;
  onPick(id: string): void;
  onRemove(id: string): void;
  onClose(): void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="sheet" role="dialog" aria-label="My effect clips">
      <div className="sheet-head">
        <strong>My effect clips</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="tiles wrap" role="group" aria-label="Effect clips">
        <button type="button" className="tile" onClick={() => fileRef.current?.click()}>
          <span className="tile-art anim-art">
            <Icon d={I.plus} size={28} />
          </span>
          Add a clip
        </button>
        {packs.map(p => (
          <span key={p.id} className="pack-tile">
            <button type="button" className="tile" onClick={() => onPick(p.id)}>
              {p.picture ? (
                // (a picture kept on this device: a blob: URL)
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tile-art" src={p.picture} alt="" />
              ) : (
                <span className="tile-art anim-art" />
              )}
              {p.name}
            </button>
            <button
              type="button"
              className="pack-remove"
              aria-label={`Remove ${p.name} from your clips`}
              onClick={() => window.confirm(`Remove “${p.name}” from your clips?`) && onRemove(p.id)}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <p className="sheet-note">
        Your own effects: fire, explosions, sparks… filmed on black or on a green screen. They stay on this
        device.
      </p>
      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="video/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function EffectClipControls({
  clip,
  onChange,
  onClose,
}: {
  clip: EffectClip;
  onChange(p: Partial<Pick<EffectClip, 'blend' | 'tolerance' | 'scale' | 'rot' | 'opacity'>>): void;
  onClose(): void;
}) {
  return (
    <div className="sheet" role="dialog" aria-label={`Adjust ${clip.name}`}>
      <div className="sheet-head">
        <strong>Adjust · {clip.name}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      <div className="sheet-tabs" role="tablist" aria-label="Blend">
        {BLENDS.map(b => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={clip.blend === b.id}
            title={b.about}
            onClick={() => onChange({ blend: b.id })}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="sliders">
        {clip.blend === 'key' && (
          <label className="slider">
            <span>Key</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clip.tolerance}
              style={pct(clip.tolerance, 0, 1)}
              onChange={e => onChange({ tolerance: +e.target.value })}
            />
            <output>{Math.round(clip.tolerance * 100)}</output>
          </label>
        )}
        <label className="slider">
          <span>Size</span>
          <input
            type="range"
            min={MIN_EFFECT_SCALE}
            max={MAX_EFFECT_SCALE}
            step={0.01}
            value={clip.scale}
            style={pct(clip.scale, MIN_EFFECT_SCALE, MAX_EFFECT_SCALE)}
            onChange={e => onChange({ scale: +e.target.value })}
          />
          <output>{Math.round(clip.scale * 100)}</output>
        </label>
        <label className="slider">
          <span>Rotate</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={clip.rot}
            style={pct(clip.rot, -180, 180)}
            onChange={e => onChange({ rot: +e.target.value })}
          />
          <output>{Math.round(clip.rot)}°</output>
        </label>
        <label className="slider">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={clip.opacity}
            style={pct(clip.opacity, 0, 1)}
            onChange={e => onChange({ opacity: +e.target.value })}
          />
          <output>{Math.round(clip.opacity * 100)}</output>
        </label>
        <p className="sheet-note">Drag it in the preview to move it.</p>
      </div>
    </div>
  );
}
