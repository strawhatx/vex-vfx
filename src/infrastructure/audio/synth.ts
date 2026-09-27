// Sound effects, made from scratch as samples: no audio files to license or download. Loops for
// the continuous effects, and one hit sound per impact style. Seeded, so each sound is the same
// every time.
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { Effect } from '@/domain/effects/palettes';
import { mulberry32 } from '@/infrastructure/rendering/rng';

export const LOOP_S = 4;

// a one-pole low-pass: keeps what's below roughly a * sampleRate / (2π)
const lowpass = (a: number) => {
  let y = 0;
  return (x: number) => (y += a * (x - y));
};

function normalize(out: Float32Array, peak: number) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] = Math.tanh((out[i] / m) * 1.3) * peak;
  return out;
}

// short bursts of noise that die away fast: crackles, snaps and zaps
function clicks(
  out: Float32Array,
  sr: number,
  perSecond: number,
  len: [number, number],
  amp: [number, number],
  seed: number,
  brightness = 0.6,
) {
  const r = mulberry32(seed);
  for (let at = 0; at < out.length;) {
    at += Math.floor((-Math.log(1 - r()) / perSecond) * sr);
    const n = Math.floor((len[0] + r() * (len[1] - len[0])) * sr),
      a = amp[0] + r() * (amp[1] - amp[0]),
      lp = lowpass(brightness);
    for (let k = 0; k < n && at + k < out.length; k++) {
      const w = r() * 2 - 1,
        env = Math.exp(-k / (n / 4));
      out[at + k] += (w - lp(w)) * a * env; // high-passed noise
    }
  }
}

// a seamless few-second loop for a continuous effect
export function effectLoop(effect: Effect, sr: number): Float32Array {
  const n = Math.floor(LOOP_S * sr),
    out = new Float32Array(n),
    r = mulberry32(effect.length * 97 + 11);
  if (effect === 'fire') {
    // a low roar, slowly breathing, with crackles
    const lp = lowpass(0.02),
      lp2 = lowpass(0.004);
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      out[i] = lp(w) * 2.2 + lp2(w) * 3 * (0.8 + 0.2 * Math.sin(((2 * Math.PI * i) / n) * 2));
    }
    clicks(out, sr, 38, [0.002, 0.009], [0.2, 0.9], 5);
  } else if (effect === 'lightning') {
    // an electric buzz that stutters on and off, with sharp zaps
    let phase = 0,
      on = 1,
      until = 0;
    for (let i = 0; i < n; i++) {
      if (i >= until) {
        on = r() < 0.7 ? 1 : 0.15;
        until = i + Math.floor((0.04 + r() * 0.25) * sr);
      }
      phase = (phase + 100 / sr) % 1;
      out[i] = (phase * 2 - 1) * 0.35 * on + (r() * 2 - 1) * 0.04;
    }
    clicks(out, sr, 9, [0.015, 0.07], [0.6, 1.4], 7, 0.3);
  } else if (effect === 'aura') {
    // a layered hum, gently pulsing, with a faint shimmer (whole cycles, so the loop is seamless)
    const lp = lowpass(0.3);
    for (let i = 0; i < n; i++) {
      const t = i / sr,
        trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.5 * t);
      const hum =
        Math.sin(2 * Math.PI * 110 * t) +
        0.8 * Math.sin(2 * Math.PI * 110.75 * t) +
        0.5 * Math.sin(2 * Math.PI * 165 * t) +
        0.3 * Math.sin(2 * Math.PI * 220 * t);
      const w = r() * 2 - 1;
      out[i] = hum * 0.25 * trem + (w - lp(w)) * 0.05;
    }
  } else if (effect === 'laser') {
    // a steady, bright beam hum: a buzzy low tone under a whining high one that wavers slightly
    const lp = lowpass(0.4);
    for (let i = 0; i < n; i++) {
      const t = i / sr,
        wob = 1 + 0.004 * Math.sin(2 * Math.PI * 3 * t);
      const buzz = ((120 * t) % 1) * 2 - 1,
        whine = Math.sin(2 * Math.PI * 1320 * t * wob);
      const w = r() * 2 - 1;
      out[i] =
        lp(buzz) * 0.35 + whine * 0.12 * (0.85 + 0.15 * Math.sin(2 * Math.PI * 7 * t)) + (w - lp(w)) * 0.03;
    }
  } else if (effect === 'water') {
    // rushing water: a soft, swelling hiss with bubbles popping in it
    const lp = lowpass(0.08),
      lp2 = lowpass(0.01);
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      const swell = 0.75 + 0.25 * Math.sin(((2 * Math.PI * i) / n) * 3);
      out[i] = (lp(w) * 1.2 + lp2(w) * 2) * swell;
    }
    // bubbles: short rising blips
    for (let b = 0; b < 40; b++) {
      const at = Math.floor(r() * (n - sr * 0.05)),
        len = Math.floor(sr * (0.01 + r() * 0.03)),
        f0 = 400 + r() * 900;
      for (let k = 0; k < len; k++) {
        const t = k / sr;
        out[at + k] += Math.sin(2 * Math.PI * f0 * t * (1 + t * 30)) * 0.25 * (1 - k / len);
      }
    }
  } else if (effect === 'glitch') {
    // digital breakup: short bursts of crushed noise and stuttering square chirps, with silence
    // between
    let until = 0,
      on = false,
      pitch = 0,
      phase = 0;
    for (let i = 0; i < n; i++) {
      if (i >= until) {
        on = r() < 0.45;
        pitch = 200 + r() * 1800;
        until = i + Math.floor((0.03 + r() * 0.12) * sr);
      }
      if (!on) {
        out[i] = 0;
        continue;
      }
      phase = (phase + pitch / sr) % 1;
      const square = phase < 0.5 ? 1 : -1;
      const crushed = Math.round((r() * 2 - 1) * 4) / 4;
      out[i] = square * 0.25 + crushed * 0.2;
    }
  } else if (effect === 'outline') {
    // a neon tube's hum: a soft mains buzz with a faint flicker (whole cycles, so it loops cleanly)
    const lp = lowpass(0.1);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const buzz = ((120 * t) % 1) * 2 - 1;
      const flicker = 0.85 + 0.15 * Math.sin(2 * Math.PI * 3 * t);
      out[i] = lp(buzz) * 0.3 * flicker + Math.sin(2 * Math.PI * 60 * t) * 0.15;
    }
  } else {
    // a sizzle with lots of tiny snaps
    const lp = lowpass(0.5);
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      out[i] = (w - lp(w)) * 0.12;
    }
    clicks(out, sr, 70, [0.001, 0.004], [0.3, 1], 9, 0.8);
  }
  // blend the end into the start so the loop point doesn't click
  const fade = Math.floor(0.05 * sr);
  for (let k = 0; k < fade; k++) {
    const w = k / fade;
    out[n - fade + k] = out[n - fade + k] * (1 - w) + out[k] * w;
  }
  return normalize(out, 0.5);
}

// how each hit sounds: thump (a falling low tone), crack (a snap of noise), rumble (and how long it
// rolls on), shimmer. Explosions are mostly thump and a long rumble.
const HITS: Record<
  ImpactStyle,
  {
    len: number;
    thump: number;
    thumpDecay: number;
    crack: number;
    rumble: number;
    rumbleDecay?: number; // seconds; 0.45 if not given
    shing: number;
    from: number;
    to: number;
  }
> = {
  punch: { len: 0.5, thump: 0.9, thumpDecay: 0.1, crack: 0.8, rumble: 0, shing: 0, from: 160, to: 55 },
  slam: { len: 1.3, thump: 1, thumpDecay: 0.3, crack: 0.6, rumble: 0.6, shing: 0, from: 120, to: 38 },
  blast: { len: 1.6, thump: 0.9, thumpDecay: 0.45, crack: 0.4, rumble: 0.5, shing: 0.2, from: 140, to: 42 },
  anime: { len: 1.0, thump: 0.7, thumpDecay: 0.14, crack: 1, rumble: 0, shing: 0.35, from: 180, to: 60 },
  fireball: {
    len: 2.2,
    thump: 1,
    thumpDecay: 0.5,
    crack: 0.7,
    rumble: 1,
    rumbleDecay: 0.9,
    shing: 0,
    from: 90,
    to: 32,
  },
  grenade: {
    len: 1.5,
    thump: 1,
    thumpDecay: 0.22,
    crack: 1,
    rumble: 0.7,
    rumbleDecay: 0.5,
    shing: 0,
    from: 150,
    to: 45,
  },
  bigboom: {
    len: 4,
    thump: 1,
    thumpDecay: 0.9,
    crack: 0.5,
    rumble: 1.2,
    rumbleDecay: 1.6,
    shing: 0,
    from: 70,
    to: 24,
  },
  // shockwaves: a deep whump with a rushing tail (energy ones ring as they go)
  ring: { len: 1.1, thump: 0.7, thumpDecay: 0.15, crack: 0.3, rumble: 0.35, shing: 0.35, from: 200, to: 60 },
  ground: {
    len: 1.6,
    thump: 1,
    thumpDecay: 0.3,
    crack: 0.5,
    rumble: 0.9,
    rumbleDecay: 0.7,
    shing: 0,
    from: 110,
    to: 35,
  },
  pulse: { len: 1.6, thump: 0.8, thumpDecay: 0.2, crack: 0.2, rumble: 0.4, shing: 0.6, from: 180, to: 50 },
  nova: { len: 1.9, thump: 0.9, thumpDecay: 0.2, crack: 0.4, rumble: 0.5, shing: 0.8, from: 220, to: 55 },
  // words: a cartoon whack, with a springy boing on top
  pow: { len: 0.6, thump: 0.9, thumpDecay: 0.1, crack: 0.7, rumble: 0.1, shing: 0.3, from: 320, to: 120 },
  boom: { len: 1.2, thump: 1, thumpDecay: 0.25, crack: 0.6, rumble: 0.6, shing: 0.2, from: 160, to: 50 },
  ko: { len: 1, thump: 1, thumpDecay: 0.18, crack: 0.9, rumble: 0.3, shing: 0.5, from: 260, to: 70 },
  bam: { len: 0.55, thump: 0.9, thumpDecay: 0.09, crack: 0.8, rumble: 0.1, shing: 0.25, from: 300, to: 110 },
  // splashes: a wet slap, then the water falling back in a rush
  splash: {
    len: 1.2,
    thump: 0.5,
    thumpDecay: 0.08,
    crack: 0.9,
    rumble: 0.7,
    rumbleDecay: 0.5,
    shing: 0,
    from: 180,
    to: 90,
  },
  bigsplash: {
    len: 2,
    thump: 0.8,
    thumpDecay: 0.15,
    crack: 1,
    rumble: 1,
    rumbleDecay: 0.9,
    shing: 0,
    from: 120,
    to: 50,
  },
};

// one hit; speed below 1 (a stretched, slowed-down impact) makes it longer and deeper
export function impactHit(style: ImpactStyle, speed: number, sr: number): Float32Array {
  const h = HITS[style],
    stretch = 1 / Math.max(0.125, Math.min(4, speed)),
    pitch = Math.max(0.5, Math.min(1.6, speed ** 0.35));
  const n = Math.floor(h.len * stretch * sr),
    out = new Float32Array(n),
    r = mulberry32(style.length * 131 + 3);
  const lpCrack = lowpass(0.5),
    lpRumble = lowpass(0.015);
  let ph = 0,
    ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      ts = t / stretch;
    const f = (h.to + (h.from - h.to) * Math.exp(-ts / 0.06)) * pitch;
    ph += (2 * Math.PI * f) / sr;
    let v = Math.sin(ph) * h.thump * Math.exp(-ts / h.thumpDecay);
    const w = r() * 2 - 1;
    v += (w - lpCrack(w)) * h.crack * Math.exp(-ts / 0.025);
    if (h.rumble) v += lpRumble(w) * 6 * h.rumble * Math.exp(-ts / (h.rumbleDecay ?? 0.45));
    if (h.shing) {
      ph2 += (2 * Math.PI * (900 + 1500 * Math.exp(-ts / 0.08)) * pitch) / sr;
      v += Math.sin(ph2) * h.shing * Math.exp(-ts / 0.3);
    }
    // a quick fade-in, so the start doesn't click
    out[i] = v * Math.min(1, i / (0.002 * sr));
  }
  return normalize(out, 0.9);
}
