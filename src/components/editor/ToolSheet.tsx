// The panel for one tool: the selected clip's effect, impact style, color or size. On phones it
// takes over the dock; on desktop it floats beside the preview.
import type { CSSProperties } from 'react';
import { IMPACTS, IMPACT_STYLES, stylesLike, type ImpactStyle } from '@/domain/effects/impacts';
import type { Aim } from '@/domain/effects/laser';
import { BACKGROUNDS, MAX_SCALE, MIN_SCALE, type Background, type Transform } from '@/domain/project/cutout';
import { EDGE_LIMITS, type EdgeSettings } from '@/domain/project/edge';
import { MAX_VOLUME } from '@/domain/project/music';
import { MAX_SPEED, MIN_SPEED } from '@/domain/project/edit';
import { DEFAULT_PAL, PALETTES, type Effect, type FxSettings } from '@/domain/effects/palettes';
import { GLITCH_STYLES, type GlitchStyle } from '@/domain/effects/glitches';
import { OUTLINE_STYLES, type OutlineStyle } from '@/domain/effects/outlines';
import { FONTS, MAX_TEXT, TEXT_STYLES, type TextStyle } from '@/domain/effects/text';
import { WATER_STYLES, type WaterStyle } from '@/domain/effects/water';
import { BODY_PARTS, type BodyPart } from '@/domain/tracking/bodyParts';
import { AimPanel } from './AimPanel';
import { fontVar } from './fonts';
import type { Source } from './player';
import { Icon, I } from './icons';

export type Tool =
  | 'effects'
  | 'color'
  | 'adjust'
  | 'impact'
  | 'look'
  | 'words'
  | 'parts'
  | 'aim'
  | 'background'
  | 'transform'
  | 'edge'
  | 'volume'
  | 'speed'
  // a look's (a filter or screen effect): its preset, and its controls (see LookSheet.tsx)
  | 'presets'
  | 'controls'
  // every layer of an effect made from a template, to customize (see custom/CustomizeSheet.tsx)
  | 'customize'
  // how a film or an overlay moves (see AnimSheet.tsx)
  | 'animation';

// lasers are hidden for now: set this to true to bring them back into the menus
export const SHOW_LASERS = false;
// overlays (objects cut out of the footage, on the Overlay layer) are hidden for now too: set this to
// true to bring back Overlay, Cut out and the Overlay layer
export const SHOW_OVERLAYS = false;

export const EFFECTS: { id: Effect; label: string }[] = [
  { id: 'fire', label: 'Fire' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'aura', label: 'Aura' },
  { id: 'water', label: 'Water' },
  { id: 'sparks', label: 'Sparks' },
  { id: 'laser', label: 'Laser' },
  { id: 'outline', label: 'Outline' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'text', label: 'Text' },
];
export const effectName = (e: Effect) => EFFECTS.find(x => x.id === e)!.label;

export const TOOL_TITLES: Record<Tool, string> = {
  effects: 'Effect',
  color: 'Color',
  adjust: 'Adjust',
  impact: 'Style',
  look: 'Style',
  words: 'Text',
  parts: 'Which part?',
  aim: 'Aim',
  background: 'Where it was',
  transform: 'Transform',
  edge: 'Edge',
  volume: 'Volume',
  speed: 'Speed',
  presets: 'Style',
  controls: 'Adjust',
  customize: 'Customize',
  animation: 'Animation',
};

// the speed slider runs evenly over the log of the speed, from MIN_SPEED to MAX_SPEED
const speedAt = (u: number) => MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** u;
const speedPos = (v: number) => Math.log(v / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
const SPEED_MARKS = [0.1, 0.5, 1, 2, 5, 10];
// speeds close to a mark land on it
const snapSpeed = (v: number) => SPEED_MARKS.find(m => Math.abs(Math.log(v / m)) < 0.06) ?? +v.toFixed(2);

// a cutout's edge settings, as sliders (see domain/project/edge.ts)
const EDGE_ROWS: { key: keyof EdgeSettings; label: string; about: string; show(v: number): string }[] = [
  { key: 'feather', label: 'Feather', about: 'Softens the edge', show: v => (v ? `${v} px` : 'Off') },
  { key: 'smooth', label: 'Smooth', about: 'Rounds off jagged steps', show: v => (v ? `${v}` : 'Off') },
  {
    key: 'grow',
    label: 'Grow',
    about: 'Moves the edge out, or in below 0',
    show: v => (v > 0 ? `+${v}` : `${v}`),
  },
  { key: 'steady', label: 'Steady', about: 'Stops the edge flickering', show: v => (v ? `${v}` : 'Off') },
];

// a picture of what each background choice leaves behind
const BACKGROUND_ART: Record<Background, string> = {
  keep: 'radial-gradient(ellipse 18% 30% at 38% 55%, #ffc640 0 95%, transparent 100%), radial-gradient(ellipse 18% 30% at 66% 55%, #ffc640 0 95%, transparent 100%), linear-gradient(#3a4a5a, #26303a)',
  clean:
    'radial-gradient(ellipse 18% 30% at 66% 55%, #ffc640 0 95%, transparent 100%), linear-gradient(#3a4a5a, #26303a)',
  clear:
    'radial-gradient(ellipse 18% 30% at 38% 55%, #111 0 95%, transparent 100%), radial-gradient(ellipse 18% 30% at 66% 55%, #ffc640 0 95%, transparent 100%), linear-gradient(#3a4a5a, #26303a)',
};

const PART_ICONS: Record<BodyPart, string> = {
  body: I.person,
  head: I.head,
  eyes: I.eye,
  handL: I.hand,
  handR: I.hand,
  footL: I.foot,
  footR: I.foot,
};

// what a new effect can come from: the spot tapped (if it can; `spot` is what to call it), then the
// person's body parts, or the object tapped when it isn't a person
function sources(suggested: BodyPart | null, spot?: string): { id: Source; label: string; icon: string }[] {
  const here = spot ? [{ id: 'spot' as const, label: spot, icon: I.target }] : [];
  if (!suggested) return [...here, { id: 'object', label: 'The object', icon: I.outline }];
  return [...here, ...BODY_PARTS.map(b => ({ ...b, icon: PART_ICONS[b.id] }))];
}

// each outline style's line, for its tile
const OUTLINE_ART: Record<OutlineStyle, string> = {
  neon: 'radial-gradient(ellipse 34% 42%, transparent 0 80%, #fff 86%, #62d8ff 92%, #a24bff55 100%, transparent 100%), #26262a',
  double:
    'radial-gradient(ellipse 34% 42%, transparent 0 70%, #fff 74%, transparent 80% 90%, #62d8ff 94%, transparent 99%), #26262a',
  glitch:
    'radial-gradient(ellipse 34% 42% at 44% 50%, transparent 0 82%, #62d8ff 88%, transparent 94%), radial-gradient(ellipse 34% 42% at 56% 50%, transparent 0 82%, #ff4fd8 88%, transparent 94%), #26262a',
  pulse:
    'radial-gradient(ellipse 30% 38%, transparent 0 82%, #62d8ff 88%, transparent 94%), radial-gradient(ellipse 42% 50%, transparent 0 86%, #62d8ff66 90%, transparent 95%), radial-gradient(ellipse 50% 58%, transparent 0 88%, #a24bff44 92%, transparent 96%), #26262a',
  sketch:
    'radial-gradient(ellipse 33% 43% at 48% 50%, transparent 0 84%, #fff 88%, transparent 92%), radial-gradient(ellipse 35% 41% at 52% 49%, transparent 0 84%, #62d8ffcc 88%, transparent 92%), #26262a',
};

// each glitch style, for its tile
const GLITCH_ART: Record<GlitchStyle, string> = {
  rgb: 'radial-gradient(circle at 40% 50%, #ff003c 0 24%, transparent 25%), radial-gradient(circle at 60% 50%, #00b3ff 0 24%, transparent 25%), radial-gradient(circle, #fff 0 24%, transparent 25%), #26262a',
  slices: 'repeating-linear-gradient(180deg, #7fe0ff 0 6px, #ff4fd8 6px 9px, #26262a 9px 14px)',
  blocks: 'conic-gradient(#ff4fd8 0 25%, #26262a 0 50%, #00ffc8 0 75%, #7a7a8a 0) 0 0 / 33% 33%',
  vhs: 'repeating-linear-gradient(180deg, rgba(0,0,0,.45) 0 1px, transparent 1px 3px), linear-gradient(135deg, #5b4b8a, #b86b5a)',
  chaos:
    'repeating-linear-gradient(180deg, transparent 0 7px, #00ffc8 7px 9px), conic-gradient(#ff003c 0 25%, #26262a 0 50%, #00b3ff 0 75%, #26262a 0) 0 0 / 40% 40%',
};

// each water style, for its tile
const WATER_ART: Record<WaterStyle, string> = {
  rain: 'repeating-linear-gradient(100deg, transparent 0 7px, rgba(210,225,240,.55) 7px 8px), linear-gradient(#2c3a48, #1a232c)',
  underwater:
    'radial-gradient(circle at 30% 70%, rgba(220,245,255,.7) 0 3px, transparent 4px), radial-gradient(circle at 62% 45%, rgba(220,245,255,.7) 0 4px, transparent 5px), linear-gradient(170deg, rgba(200,240,255,.35), transparent 40%), linear-gradient(#1f7f95, #0a2f40)',
};

// each text style, for its tile
const TEXT_ART: Record<TextStyle, string> = {
  behind:
    'linear-gradient(90deg, transparent 38%, #555a63 38% 62%, transparent 62%), linear-gradient(#26262a 30%, #ffc640 30% 62%, #26262a 62%)',
  follow:
    'linear-gradient(#26262a 22%, #fff 22% 40%, #26262a 40% 48%, transparent 48%), conic-gradient(from 150deg at 50% 70%, #ffc640 0 60deg, #26262a 0), #26262a',
  title: 'linear-gradient(#26262a 34%, #111 34% 38%, #ffc640 38% 62%, #111 62% 66%, #26262a 66%)',
};

// effects with styles of their own: picked when adding one (with start's settings too), and
// changed later with Style
type Look = { id: string; label: string; art: string; fx: Partial<FxSettings>; start?: Partial<FxSettings> };
const LOOKS: Partial<Record<Effect, Look[]>> = {
  outline: OUTLINE_STYLES.map(o => ({ ...o, art: OUTLINE_ART[o.id], fx: { outline: o.id } })),
  glitch: GLITCH_STYLES.map(o => ({ ...o, art: GLITCH_ART[o.id], fx: { glitch: o.id } })),
  water: WATER_STYLES.map(o => ({ ...o, art: WATER_ART[o.id], fx: { water: o.id } })),
  text: TEXT_STYLES.map(o => ({
    ...o,
    art: TEXT_ART[o.id],
    fx: { textStyle: o.id },
    start: { text: o.words },
  })),
};
export const hasLooks = (e: Effect) => !!LOOKS[e];
const lookOn = (fx: FxSettings, l: Look) =>
  Object.entries(l.fx).every(([k, v]) => fx[k as keyof FxSettings] === v);

// a burst of each impact style's colors, for its tile
export const IMPACT_ART: Record<ImpactStyle, string> = {
  punch: 'radial-gradient(circle, #fff 0 18%, #ffe9b0 30%, #ff9a3c 52%, transparent 72%), #26262a',
  slam: 'radial-gradient(circle at 50% 70%, #fff 0 14%, #ffd27a 30%, #b3531e 55%, transparent 75%), #26262a',
  blast: 'radial-gradient(circle, #f0fbff 0 16%, #7fe0ff 34%, #2f7bff 55%, transparent 78%), #26262a',
  anime: 'radial-gradient(circle, #fff 0 22%, #d98bff 40%, #8a2be2 60%, transparent 80%), #fff3',
  fireball:
    'radial-gradient(circle, #fff6d8 0 14%, #ffc640 28%, #ff6a1a 48%, #3a2a26 70%, transparent 84%), #26262a',
  grenade:
    'radial-gradient(circle at 50% 60%, #fff 0 10%, #ffc640 22%, #b3200e 40%, #2a2524 62%, transparent 76%), #26262a',
  bigboom:
    'radial-gradient(ellipse 60% 40% at 50% 30%, #4a4240 0 40%, transparent 60%), radial-gradient(circle at 50% 70%, #fff6d8 0 12%, #ff6a1a 32%, #3a2a26 55%, transparent 70%), #26262a',
  ring: 'radial-gradient(circle, transparent 0 38%, #fff 42%, #7fe0ff 48%, transparent 58%), #26262a',
  ground:
    'radial-gradient(ellipse 50% 18% at 50% 62%, transparent 0 55%, #a39382 70%, transparent 90%), #26262a',
  pulse:
    'radial-gradient(circle, #fff 0 8%, transparent 12% 24%, #d98bff 27%, transparent 32% 44%, #8a2be2 47%, transparent 53%), #26262a',
  nova: 'radial-gradient(circle, #000 0 9%, #ff7a1a 15%, #a24bff 28%, #ffd6f6 42%, #62d8ff 56%, transparent 70%), #26262a',
  pow: 'conic-gradient(from 10deg, #ffc640 0 8%, #ff6a1a 8% 16%, #ffc640 16% 24%, #ff6a1a 24% 32%, #ffc640 32% 40%, #ff6a1a 40% 48%, #ffc640 48% 56%, #ff6a1a 56% 64%, #ffc640 64% 72%, #ff6a1a 72% 80%, #ffc640 80% 88%, #ff6a1a 88%)',
  boom: 'conic-gradient(from 10deg, #ffc640 0 8%, #ff6a1a 8% 16%, #ffc640 16% 24%, #ff6a1a 24% 32%, #ffc640 32% 40%, #ff6a1a 40% 48%, #ffc640 48% 56%, #ff6a1a 56% 64%, #ffc640 64% 72%, #ff6a1a 72% 80%, #ffc640 80% 88%, #ff6a1a 88%)',
  ko: 'conic-gradient(from 10deg, #ffc640 0 8%, #ff6a1a 8% 16%, #ffc640 16% 24%, #ff6a1a 24% 32%, #ffc640 32% 40%, #ff6a1a 40% 48%, #ffc640 48% 56%, #ff6a1a 56% 64%, #ffc640 64% 72%, #ff6a1a 72% 80%, #ffc640 80% 88%, #ff6a1a 88%)',
  bam: 'conic-gradient(from 10deg, #ffc640 0 8%, #ff6a1a 8% 16%, #ffc640 16% 24%, #ff6a1a 24% 32%, #ffc640 32% 40%, #ff6a1a 40% 48%, #ffc640 48% 56%, #ff6a1a 56% 64%, #ffc640 64% 72%, #ff6a1a 72% 80%, #ffc640 80% 88%, #ff6a1a 88%)',
  splash:
    'radial-gradient(ellipse 60% 18% at 50% 72%, transparent 0 40%, #7fe0ff 48%, transparent 58%), radial-gradient(ellipse 30% 40% at 50% 48%, #f0fbff 0 30%, #7fe0ff55 55%, transparent 70%), #1d3a4a',
  bigsplash:
    'radial-gradient(ellipse 60% 18% at 50% 72%, transparent 0 40%, #7fe0ff 48%, transparent 58%), radial-gradient(ellipse 30% 40% at 50% 48%, #f0fbff 0 30%, #7fe0ff55 55%, transparent 70%), #1d3a4a',
};

const swatchBg = (i: number) => {
  const c = PALETTES[i].c;
  return `radial-gradient(circle at 40% 40%, ${c[0]}, ${c[1]} 35%, ${c[2]} 70%, ${c[3]})`;
};
const pct = (v: number, min: number, max: number) =>
  ({ '--p': `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

export function ToolSheet({
  tool,
  title,
  fx,
  onChange,
  onClose,
  impact,
  onImpact,
  suggested,
  spot,
  onPart,
  aim,
  onAim,
  bg,
  onBackground,
  transform,
  keyed,
  onTransform,
  onReset,
  edge,
  onEdge,
  volume,
  onVolume,
  speed,
  onSpeed,
}: {
  tool: Tool;
  title: string;
  fx: FxSettings;
  onChange(p: Partial<FxSettings>): void;
  onClose(): void;
  impact?: ImpactStyle | null;
  onImpact?(style: ImpactStyle): void;
  // parts: the one nearest the tap, and what to do with the one picked
  // parts: where a new effect comes from. suggested: the body part nearest the tap (null: not a
  // person, so the object tapped); spot: what to call coming from the spot tapped instead, if it can
  suggested?: BodyPart | null;
  spot?: string;
  onPart?(from: Source): void;
  // aim: a laser's direction, and whether it hits a tapped spot instead
  aim?: Aim;
  onAim?: { set(p: { h?: number; v?: number }): void; target(): void; clear(): void };
  // background: what a cutout leaves where it was cut from
  bg?: Background | null;
  onBackground?(bg: Background): void;
  // transform: a cutout's at the playhead (keyed: it has keyframes, so changes set the one here)
  transform?: Transform | null;
  keyed?: boolean;
  onTransform?(p: Partial<Transform>): void;
  onReset?(): void;
  // edge: a cutout's, being checked
  edge?: EdgeSettings;
  onEdge?(p: Partial<EdgeSettings>): void;
  // volume: music's (1 = as recorded)
  volume?: number;
  onVolume?(v: number): void;
  // speed: a film's (and how long it's filmed for, s), and whether its pitch changes with it
  speed?: { speed: number; pitch: boolean; length: number };
  onSpeed?(p: { speed?: number; pitch?: boolean }): void;
}) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" aria-label="Done" onClick={onClose}>
          <Icon d={I.check} />
        </button>
      </div>
      {tool === 'parts' && (
        <div className="tiles" role="group" aria-label="Where it comes from">
          {sources(suggested ?? null, spot).map(b => (
            <button
              key={b.id}
              type="button"
              className="tile part-tile"
              aria-pressed={suggested === b.id}
              onClick={() => onPart?.(b.id)}
            >
              <span className={`tile-art${b.id.endsWith('L') ? ' mirror' : ''}`}>
                <Icon d={b.icon} size={30} />
              </span>
              {b.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'look' && LOOKS[fx.effect] && (
        <div className="tiles" role="group" aria-label="Style">
          {LOOKS[fx.effect]!.map(l => (
            <button
              key={l.id}
              type="button"
              className="tile"
              aria-pressed={lookOn(fx, l)}
              onClick={() => onChange(l.fx)}
            >
              <span className="tile-art" style={{ background: l.art }} />
              {l.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'words' && (
        <div className="words">
          <input
            className="words-input"
            type="text"
            value={fx.text}
            maxLength={MAX_TEXT}
            aria-label="Words"
            placeholder="Type something"
            enterKeyHint="done"
            onChange={e => onChange({ text: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && onClose()}
          />
          <div className="tiles" role="group" aria-label="Font">
            {FONTS.map(f => (
              <button
                key={f.id}
                type="button"
                className="tile"
                aria-pressed={fx.font === f.id}
                onClick={() => onChange({ font: f.id })}
              >
                <span className="tile-art font-art" style={{ fontFamily: fontVar(f.id) }}>
                  Aa
                </span>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tool === 'effects' && (
        <div className="tiles" role="group" aria-label="Effect">
          {EFFECTS.filter(f => SHOW_LASERS || f.id !== 'laser').map(f => (
            <button
              key={f.id}
              type="button"
              className="tile"
              aria-pressed={fx.effect === f.id}
              onClick={() => onChange({ effect: f.id, pal: DEFAULT_PAL[f.id] })}
            >
              <span className="tile-art" style={{ background: swatchBg(DEFAULT_PAL[f.id]) }} />
              {f.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'impact' && (
        <div className="tiles" role="group" aria-label="Style">
          {(impact ? stylesLike(impact) : IMPACT_STYLES).map(st => (
            <button
              key={st}
              type="button"
              className="tile"
              aria-pressed={impact === st}
              onClick={() => onImpact?.(st)}
            >
              <span className="tile-art" style={{ background: IMPACT_ART[st] }} />
              {IMPACTS[st].label}
            </button>
          ))}
        </div>
      )}
      {tool === 'color' && (
        <div className="tiles" role="group" aria-label="Color">
          {PALETTES.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className="tile"
              aria-pressed={fx.pal === i}
              onClick={() => onChange({ pal: i })}
            >
              <span className="tile-art round" style={{ background: swatchBg(i) }} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {tool === 'background' && (
        <div className="tiles" role="group" aria-label="What's left where it was cut from">
          {BACKGROUNDS.map(b => (
            <button
              key={b.id}
              type="button"
              className="tile"
              aria-pressed={bg === b.id}
              title={b.about}
              onClick={() => onBackground?.(b.id)}
            >
              <span className="tile-art" style={{ background: BACKGROUND_ART[b.id] }} />
              {b.label}
            </button>
          ))}
        </div>
      )}
      {tool === 'transform' && transform && (
        <div className="sliders">
          <label className="slider">
            <span>Scale</span>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              value={transform.scale}
              style={pct(transform.scale, MIN_SCALE, MAX_SCALE)}
              onChange={e => onTransform?.({ scale: +e.target.value })}
            />
            <output>{Math.round(transform.scale * 100)}</output>
          </label>
          <label className="slider">
            <span>Rotate</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={transform.rot}
              style={pct(transform.rot, -180, 180)}
              onChange={e => onTransform?.({ rot: +e.target.value })}
            />
            <output>{Math.round(transform.rot)}°</output>
          </label>
          <label className="slider">
            <span>Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={transform.opacity}
              style={pct(transform.opacity, 0, 1)}
              onChange={e => onTransform?.({ opacity: +e.target.value })}
            />
            <output>{Math.round(transform.opacity * 100)}</output>
          </label>
          <p className="sheet-note">
            Drag it in the preview to move it.
            {keyed ? ' Changes set the keyframe at the playhead.' : ' Add a keyframe to animate it.'}
          </p>
          <button type="button" className="sheet-btn" onClick={onReset}>
            Reset
          </button>
        </div>
      )}
      {tool === 'edge' && edge && (
        <div className="sliders">
          {EDGE_ROWS.map(({ key, label, about, show }) => {
            const { min, max, step } = EDGE_LIMITS[key];
            return (
              <label key={key} className="slider" title={about}>
                <span>{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={edge[key]}
                  style={pct(edge[key], min, max)}
                  onChange={e => onEdge?.({ [key]: +e.target.value })}
                />
                <output>{show(edge[key])}</output>
              </label>
            );
          })}
        </div>
      )}
      {tool === 'speed' && speed && (
        <div className="sliders">
          <p className="sheet-note">
            Duration: {speed.length.toFixed(1)}s → <b>{(speed.length / speed.speed).toFixed(1)}s</b>
          </p>
          <label className="slider">
            <span>Speed</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={speedPos(speed.speed)}
              style={pct(speedPos(speed.speed), 0, 1)}
              onChange={e => onSpeed?.({ speed: snapSpeed(speedAt(+e.target.value)) })}
            />
            <output>{+speed.speed.toFixed(2)}×</output>
          </label>
          <div className="speed-marks" aria-hidden="true">
            {SPEED_MARKS.map(m => (
              <span key={m} style={{ left: `${speedPos(m) * 100}%` }}>
                {m}×
              </span>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={speed.pitch}
              onChange={e => onSpeed?.({ pitch: e.target.checked })}
            />
            Change audio pitch
          </label>
        </div>
      )}
      {tool === 'volume' && volume !== undefined && (
        <div className="sliders">
          <label className="slider">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={MAX_VOLUME}
              step={0.05}
              value={volume}
              style={pct(volume, 0, MAX_VOLUME)}
              onChange={e => onVolume?.(+e.target.value)}
            />
            <output>{volume === 0 ? 'Off' : Math.round(volume * 100)}</output>
          </label>
        </div>
      )}
      {tool === 'aim' && aim && onAim && (
        <AimPanel aim={aim} onChange={onAim.set} onTarget={onAim.target} onClear={onAim.clear} />
      )}
      {tool === 'adjust' && (
        <div className="sliders">
          <label className="slider">
            <span>Size</span>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.05}
              value={fx.size}
              style={pct(fx.size, 0.3, 2.5)}
              onChange={e => onChange({ size: +e.target.value })}
            />
            <output>{Math.round(fx.size * 100)}</output>
          </label>
          <label className="slider">
            <span>Intensity</span>
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={fx.intensity}
              style={pct(fx.intensity, 0.2, 2)}
              onChange={e => onChange({ intensity: +e.target.value })}
            />
            <output>{Math.round(fx.intensity * 100)}</output>
          </label>
          <label className="slider">
            <span>Sound</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={fx.volume}
              style={pct(fx.volume, 0, 1.5)}
              onChange={e => onChange({ volume: +e.target.value })}
            />
            <output>{fx.volume === 0 ? 'Off' : Math.round(fx.volume * 100)}</output>
          </label>
        </div>
      )}
    </div>
  );
}
