// Paths: a strand of something (a whip, a rope, a ribbon, a tentacle, a trail, a beam) that moves
// on its own, driven by what it's attached to. Three parts, each chosen separately:
//   - the path: where it's anchored. It follows something in the footage (the object tapped, or a
//     body part: a hand holding the whip), or it's drawn freehand on the preview; its far end can
//     be held too (a string between two things).
//   - the form: how it behaves. A chain of points, pulled along by the anchor, with gravity, air
//     drag and stiffness (a whip is stiff at the handle and loose at the tip, so it snaps; a rope
//     just hangs), or no physics at all (a trail is where the anchor has been; a beam is rigid).
//   - the look: how it's drawn (neon, energy, lightning, fire…), in the renderer.
// The motion is simulated frame by frame from the start of the clip, from its anchor's positions
// alone, so any frame comes out the same however it's reached.
import type { Effect } from './palettes';

export type Form = 'whip' | 'rope' | 'ribbon' | 'tentacle' | 'trail' | 'beam';
export type StrandLook = 'neon' | 'energy' | 'lightning' | 'solid' | 'fire' | 'sparks' | 'aura';

export const FORMS: { id: Form; label: string; about: string }[] = [
  { id: 'whip', label: 'Whip', about: 'Stiff at the handle, snaps at the tip' },
  { id: 'rope', label: 'Rope', about: 'Hangs and swings' },
  { id: 'ribbon', label: 'Ribbon', about: 'Floats on the air' },
  { id: 'tentacle', label: 'Tentacle', about: 'Curls on its own' },
  { id: 'trail', label: 'Trail', about: 'Streaks behind as it moves' },
  { id: 'beam', label: 'Beam', about: 'Rigid and straight' },
];

export const STRAND_LOOKS: { id: StrandLook; label: string }[] = [
  { id: 'neon', label: 'Neon' },
  { id: 'energy', label: 'Energy' },
  { id: 'lightning', label: 'Lightning' },
  { id: 'solid', label: 'Solid' },
  { id: 'fire', label: 'Fire' },
  { id: 'sparks', label: 'Sparks' },
  { id: 'aura', label: 'Aura' },
];

// the looks drawn by the particle effects, along the strand
export const particleLook = (look: StrandLook): Effect | null =>
  look === 'fire' || look === 'sparks' || look === 'aura' ? look : null;

// the sound a path makes: its look's
export const soundOf = (look: StrandLook): Effect =>
  look === 'fire' ? 'fire' : look === 'lightning' || look === 'sparks' ? 'lightning' : 'aura';

// how each form moves. kind: a chain of points (physics), the anchor's recent path, or rigid.
// gravity: in frame heights a second squared; drag: speed lost a step; stiff/stiffTip: how hard
// each point is pulled back to its rest bend, at the anchor and at the tip; wave: how much it curls
// by itself; taper: its width at the anchor and at the tip
interface Physics {
  kind: 'chain' | 'trail' | 'rigid';
  gravity: number;
  drag: number;
  stiff: number;
  stiffTip: number;
  wave: number;
  taper: [number, number];
}
export const FORM_PHYSICS: Record<Form, Physics> = {
  whip: { kind: 'chain', gravity: 0.25, drag: 0.015, stiff: 0.6, stiffTip: 0.01, wave: 0, taper: [1, 0.12] },
  rope: { kind: 'chain', gravity: 2.2, drag: 0.03, stiff: 0.02, stiffTip: 0.01, wave: 0, taper: [1, 1] },
  ribbon: {
    kind: 'chain',
    gravity: 0.15,
    drag: 0.14,
    stiff: 0.06,
    stiffTip: 0.01,
    wave: 0.25,
    taper: [1, 0.7],
  },
  tentacle: {
    kind: 'chain',
    gravity: 0.08,
    drag: 0.08,
    stiff: 0.3,
    stiffTip: 0.12,
    wave: 1,
    taper: [1, 0.05],
  },
  trail: { kind: 'trail', gravity: 0, drag: 0, stiff: 0, stiffTip: 0, wave: 0, taper: [0.08, 1] },
  beam: { kind: 'rigid', gravity: 0, drag: 0, stiff: 0, stiffTip: 0, wave: 0, taper: [1, 1] },
};

// the width along the strand, 0 at the anchor to 1 at the tip (a trail's "tip" is its oldest end)
export function widthAt(form: Form, u: number) {
  const [a, b] = FORM_PHYSICS[form].taper;
  return a + (b - a) * u;
}

// the user's settings for a path
export interface StrandSettings {
  form: Form;
  look: StrandLook;
  length: number; // in frame heights (a trail: seconds of its path)
  flex: number; // 0 stiff .. 1 floppy
  weight: number; // gravity multiplier, 0..2
  dir: number; // degrees: which way it points at rest from its anchor (0 right, 90 down)
}

export const DEFAULT_STRAND: StrandSettings = {
  form: 'whip',
  look: 'neon',
  length: 0.5,
  flex: 0.5,
  weight: 1,
  dir: 0,
};

type Pt = { x: number; y: number };

// what drives the strand at one frame: where its anchor is (null: lost, so it's held and hidden),
// where its far end is held (if it is), the time step, and how far through the clip it is (0..1)
export interface StrandInput {
  at: Pt | null;
  end: Pt | null;
  t: number;
  dt: number;
  u: number;
  restart: boolean; // a new scene starts here: start again from rest
}

// a drawn shape: its points relative to the first (the anchor), in px
export type Drawn = Pt[] | null;

// the strand at one frame, anchor first: its points, and how fast its tip is going (frame heights
// a second; a whip cracks when it's fast), or null where it isn't shown
export type StrandFrame = { pts: Pt[]; tip: number } | null;

export const SEGMENTS = 20;
const SUBSTEPS = 3,
  ITERATIONS = 10;
// held at both ends, a strand is at least this much longer than the gap between them, so it sags
const SLACK = 1.15;

// the strand at every frame. unit: the frame's height in px (lengths and gravity scale with it)
export function simulate(
  inputs: readonly StrandInput[],
  s: StrandSettings,
  drawn: Drawn,
  unit: number,
): StrandFrame[] {
  const ph = FORM_PHYSICS[s.form];
  if (ph.kind === 'trail') return trail(inputs, s, drawn, unit);
  if (ph.kind === 'rigid')
    return inputs.map(f => (f.at ? { pts: rigid(f.at, f.end, s, drawn, unit), tip: 0 } : null));
  return chain(inputs, s, ph, drawn, unit);
}

// ---------- the rest shape ----------

// the strand's rest shape relative to its anchor: the drawn shape resampled, or a straight line in
// its rest direction
export function restShape(s: StrandSettings, drawn: Drawn, unit: number, n = SEGMENTS): Pt[] {
  if (drawn && drawn.length >= 2) return resample(drawn, n);
  const len = Math.max(0.02, s.length) * unit,
    a = (s.dir * Math.PI) / 180;
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: (Math.cos(a) * len * i) / n,
    y: (Math.sin(a) * len * i) / n,
  }));
}

// n + 1 points evenly along the polyline
export function resample(line: readonly Pt[], n: number): Pt[] {
  const cum = [0];
  for (let k = 1; k < line.length; k++)
    cum.push(cum[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  const total = cum[cum.length - 1];
  return Array.from({ length: n + 1 }, (_, i) => pointAt(line, cum, (total * i) / n));
}

function pointAt(line: readonly Pt[], cum: readonly number[], d: number): Pt {
  let k = 1;
  while (k < line.length - 1 && cum[k] < d) k++;
  const seg = cum[k] - cum[k - 1] || 1,
    u = Math.max(0, Math.min(1, (d - cum[k - 1]) / seg));
  return {
    x: line[k - 1].x + (line[k].x - line[k - 1].x) * u,
    y: line[k - 1].y + (line[k].y - line[k - 1].y) * u,
  };
}

// ---------- rigid ----------

function rigid(at: Pt, end: Pt | null, s: StrandSettings, drawn: Drawn, unit: number): Pt[] {
  if (end) return resample([at, end], SEGMENTS);
  return restShape(s, drawn, unit).map(p => ({ x: at.x + p.x, y: at.y + p.y }));
}

// ---------- trail ----------
// Following something, it's where the anchor has been in the last `length` seconds, newest first.
// Drawn, a head travels along the drawn line over the clip, with its trail behind it.
function trail(inputs: readonly StrandInput[], s: StrandSettings, drawn: Drawn, unit: number): StrandFrame[] {
  const out: StrandFrame[] = [];
  const secs = Math.max(0.05, s.length);
  if (drawn && drawn.length >= 2) {
    const line = resample(drawn, 200);
    const tail = Math.min(0.9, secs / 2);
    for (const f of inputs) {
      if (!f.at) {
        out.push(null);
        continue;
      }
      const head = Math.max(0, Math.min(1, f.u * (1 + tail)));
      const from = Math.max(0, head - tail);
      const a = Math.round(from * 200),
        b = Math.round(Math.min(1, head) * 200);
      const pts = line
        .slice(a, b + 1)
        .reverse()
        .map(p => ({ x: f.at!.x + p.x, y: f.at!.y + p.y }));
      out.push(pts.length >= 2 ? { pts: resample(pts, SEGMENTS), tip: 0 } : null);
    }
    return out;
  }
  const hist: { t: number; p: Pt }[] = [];
  let last: Pt | null = null;
  for (const f of inputs) {
    if (f.restart) {
      hist.length = 0;
      last = null;
    }
    const p: Pt | null = f.at ?? last;
    if (p) hist.push({ t: f.t, p });
    while (hist.length && hist[0].t < f.t - secs) hist.shift();
    const speed =
      last && f.at ? Math.hypot(f.at.x - last.x, f.at.y - last.y) / Math.max(1e-3, f.dt) / unit : 0;
    last = p;
    if (!f.at || hist.length < 2) {
      out.push(null);
      continue;
    }
    const pts = hist.map(h => h.p).reverse();
    out.push({ pts: moved(pts) ? resample(pts, SEGMENTS) : pts, tip: speed });
  }
  return out;
}

// whether the points go anywhere (a trail standing still is just a dot)
const moved = (pts: Pt[]) => pts.some(p => Math.abs(p.x - pts[0].x) + Math.abs(p.y - pts[0].y) > 0.5);

// ---------- chain ----------
// Verlet: each point keeps going the way it was (less drag), falls, and is pulled back towards the
// bend it has at rest; then the links are made their length again, the anchor (and a held end)
// staying put. Stepped a few times a frame, the anchor moving smoothly between frames.
function chain(
  inputs: readonly StrandInput[],
  s: StrandSettings,
  ph: Physics,
  drawn: Drawn,
  unit: number,
): StrandFrame[] {
  const rest = restShape(s, drawn, unit);
  const n = rest.length - 1;
  const restSeg = Math.max(1e-3, pathLength(rest) / n);
  let seg = restSeg;
  // the rest bend: each link's direction, and how it turns from the one before
  const angle = (k: number) => Math.atan2(rest[k + 1].y - rest[k].y, rest[k + 1].x - rest[k].x);
  const base = angle(0);
  const bend = Array.from({ length: n }, (_, k) => (k === 0 ? 0 : wrap(angle(k) - angle(k - 1))));
  // floppier as flex goes up: stiffness from twice the form's (flex 0) to none (flex 1)
  const flexK = 2 * (1 - Math.max(0, Math.min(1, s.flex)));
  const stiff = Array.from({ length: n + 1 }, (_, i) =>
    Math.min(0.9, (ph.stiff + (ph.stiffTip - ph.stiff) * (i / n)) * flexK),
  );
  const g = ph.gravity * s.weight * unit;

  const out: StrandFrame[] = [];
  let p: Pt[] = [],
    prev: Pt[] = [],
    anchor: Pt | null = null;
  // at rest from `at`; held at `end` too, it starts strung across to it, long enough to sag
  const reset = (at: Pt, end: Pt | null) => {
    seg = restSeg;
    if (end) {
      seg = Math.max(restSeg, (Math.hypot(end.x - at.x, end.y - at.y) * SLACK) / n);
      p = resample([at, end], n);
    } else p = rest.map(r => ({ x: at.x + r.x, y: at.y + r.y }));
    prev = p.map(q => ({ ...q }));
    anchor = at;
  };

  for (const f of inputs) {
    if (f.restart || !anchor) {
      if (f.at) reset(f.at, f.end);
      else {
        out.push(null);
        continue;
      }
    }
    const from: Pt = anchor!,
      to = f.at ?? from;
    const dts = Math.max(1e-3, f.dt) / SUBSTEPS;
    const tipBefore = { ...p[n] };
    for (let sub = 1; sub <= SUBSTEPS; sub++) {
      const k = sub / SUBSTEPS;
      const a = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      const time = f.t - f.dt + f.dt * k;
      // move
      for (let i = 1; i <= n; i++) {
        const q = p[i],
          o = prev[i];
        const vx = (q.x - o.x) * (1 - ph.drag),
          vy = (q.y - o.y) * (1 - ph.drag);
        prev[i] = { ...q };
        q.x += vx;
        q.y += vy + g * dts * dts;
      }
      p[0] = { ...a };
      prev[0] = { ...a };
      // pulled back towards the rest bend, curling by itself too
      let dir = base;
      for (let i = 1; i <= n; i++) {
        if (i >= 2) dir = Math.atan2(p[i - 1].y - p[i - 2].y, p[i - 1].x - p[i - 2].x) + bend[i - 1];
        if (ph.wave) dir += ph.wave * 0.18 * Math.sin(time * 3.2 - i * 0.45) * (i / n);
        const tx = p[i - 1].x + Math.cos(dir) * seg,
          ty = p[i - 1].y + Math.sin(dir) * seg;
        const k2 = stiff[i];
        p[i].x += (tx - p[i].x) * k2;
        p[i].y += (ty - p[i].y) * k2;
      }
      // the links their length again
      for (let it = 0; it < ITERATIONS; it++) {
        for (let i = 0; i < n; i++) link(p, i, seg, i === 0, f.end !== null && i === n - 1);
        if (f.end) p[n] = { ...f.end };
        p[0] = { ...a };
      }
    }
    anchor = to;
    const tip = Math.hypot(p[n].x - tipBefore.x, p[n].y - tipBefore.y) / Math.max(1e-3, f.dt) / unit;
    out.push(f.at ? { pts: p.map(q => ({ ...q })), tip } : null);
  }
  return out;
}

// makes the link from point i to i + 1 its length; a pinned end doesn't move
function link(p: Pt[], i: number, len: number, pinA: boolean, pinB: boolean) {
  const a = p[i],
    b = p[i + 1];
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy) || 1e-6;
  const diff = (d - len) / d;
  const wa = pinA ? 0 : pinB ? 1 : 0.5,
    wb = pinB ? 0 : pinA ? 1 : 0.5;
  a.x += dx * diff * wa;
  a.y += dy * diff * wa;
  b.x -= dx * diff * wb;
  b.y -= dy * diff * wb;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function pathLength(pts: readonly Pt[]) {
  let d = 0;
  for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  return d;
}
